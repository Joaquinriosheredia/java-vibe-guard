// Baseline comparator for vibeguard-baseline.json.
// Spec: docs/baseline.md — any behavior change here must be reflected
// there first; this file implements that document, it does not define
// its own contract.
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASELINE_FILE_NAME = 'vibeguard-baseline.json';
const LOCATION = /^(.*):(\d+)$/;

// (ruleId, relativePath, message) — the line is deliberately excluded.
// JSON.stringify of the tuple avoids delimiter collisions with paths or
// messages that might contain ":" or other separator characters.
export function bucketKey(finding) {
  const match = LOCATION.exec(finding.location);
  const relativePath = match ? match[1] : finding.location;
  return JSON.stringify([finding.rule, relativePath, finding.message]);
}

function lineOf(finding) {
  const match = LOCATION.exec(finding.location);
  return match ? Number(match[2]) : 0;
}

// Groups findings by bucket key, preserving each finding's relative order
// within its bucket (unsorted — sorting is sortBucketFindings's job).
export function groupIntoBuckets(findings) {
  const buckets = new Map();
  for (const finding of findings) {
    const key = bucketKey(finding);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(finding);
  }
  return buckets;
}

// Line ascending (file-level findings = line 0), then a stable sort so
// equal-line findings keep their original array order as the tiebreaker.
export function sortBucketFindings(findings) {
  return [...findings]
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      const lineDiff = lineOf(a.finding) - lineOf(b.finding);
      if (lineDiff !== 0) return lineDiff;
      return a.index - b.index;
    })
    .map(({ finding }) => finding);
}

// Splits an already-sorted bucket into { baseline, new } given N (the
// baseline count for this bucket): the first N are baseline, any
// remainder beyond N is new.
export function resolveBucketCounts(sortedFindings, baselineCount) {
  return {
    baseline: sortedFindings.slice(0, baselineCount),
    new: sortedFindings.slice(baselineCount),
  };
}

function emptyBaseline() {
  return { version: 1, generatedAt: null, buckets: new Map() };
}

function isValidBucketEntry(entry) {
  return (
    entry &&
    typeof entry.ruleId === 'string' &&
    typeof entry.relativePath === 'string' &&
    typeof entry.message === 'string' &&
    Number.isInteger(entry.count) &&
    entry.count >= 0
  );
}

// Loads vibeguard-baseline.json from the project root. Missing file,
// invalid JSON, wrong/missing version, or a non-array `buckets` are all
// non-fatal — the scan proceeds with an empty baseline (every finding
// evaluates as new), mirroring config.js's loadConfig defensive stance.
export function loadBaseline(projectRoot) {
  const filePath = join(projectRoot, BASELINE_FILE_NAME);
  if (!existsSync(filePath)) return emptyBaseline();

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return emptyBaseline();
  }

  if (parsed?.version !== 1) return emptyBaseline();
  if (!Array.isArray(parsed.buckets)) return emptyBaseline();

  const buckets = new Map();
  for (const entry of parsed.buckets) {
    if (!isValidBucketEntry(entry)) continue;
    const key = bucketKey({ rule: entry.ruleId, location: entry.relativePath, message: entry.message });
    buckets.set(key, entry.count); // last entry wins on duplicate keys
  }

  return { version: 1, generatedAt: parsed.generatedAt ?? null, buckets };
}

// Writes vibeguard-baseline.json from the current findings, always fully
// replacing any existing file (no merge, no confirmation — the baseline
// is a regenerable snapshot, not a hand-edited artifact; see docs/baseline.md §7).
// Suppressed findings (inline/standalone/config) never contribute to the
// written counts — the baseline layer only captures debt the earlier
// pipeline stages didn't already resolve.
export function writeBaseline(projectRoot, findings) {
  const eligible = findings.filter(f => !f.suppressed);
  const grouped = groupIntoBuckets(eligible);

  const buckets = [...grouped.entries()].map(([key, bucketFindings]) => {
    const [ruleId, relativePath, message] = JSON.parse(key);
    return { ruleId, relativePath, message, count: bucketFindings.length };
  });

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    buckets,
  };

  writeFileSync(join(projectRoot, BASELINE_FILE_NAME), JSON.stringify(output, null, 2));
  return output;
}

// Applies a loaded baseline to a findings array (as produced by
// applySuppressions — each finding already carries `suppressed`).
//
// Every finding gets both `baselined` and `baselineSkipped`, never
// omitted:
//   - baselineSkipped: true  → already suppressed, never evaluated;
//     baselined is always false in this case (no real evaluation happened).
//   - baselineSkipped: false → went through the real N/M comparison;
//     baselined reflects the actual outcome.
export function applyBaseline(findings, baseline) {
  const skipped = [];
  const eligible = [];
  for (const finding of findings) {
    if (finding.suppressed) {
      skipped.push({ ...finding, baselined: false, baselineSkipped: true });
    } else {
      eligible.push(finding);
    }
  }

  const decoratedByFinding = new Map();
  const grouped = groupIntoBuckets(eligible);
  for (const [key, bucketFindings] of grouped) {
    const baselineCount = baseline.buckets.get(key) ?? 0;
    const sorted = sortBucketFindings(bucketFindings);
    const { baseline: known, new: fresh } = resolveBucketCounts(sorted, baselineCount);

    for (const finding of known) {
      decoratedByFinding.set(finding, { ...finding, baselined: true, baselineSkipped: false });
    }
    for (const finding of fresh) {
      decoratedByFinding.set(finding, { ...finding, baselined: false, baselineSkipped: false });
    }
  }

  const evaluated = eligible.map(f => decoratedByFinding.get(f));

  // Preserve the original relative order of the input array.
  const result = [];
  let skippedIdx = 0;
  let evaluatedIdx = 0;
  for (const finding of findings) {
    if (finding.suppressed) {
      result.push(skipped[skippedIdx++]);
    } else {
      result.push(evaluated[evaluatedIdx++]);
    }
  }
  return result;
}
