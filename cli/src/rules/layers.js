const CONTROLLER_RES = [/@RestController\b/, /@Controller\b/];
const REPO_FIELD_RE  = /private\s+(final\s+)?(\w*[Rr]epository\b)/;
const REPO_PARAM_RE  = /[,(]\s*(\w*[Rr]epository\b)/;
const KAFKA_FIELD_RE = /private\s+(final\s+)?KafkaTemplate\b/;
const KAFKA_PARAM_RE = /[,(]\s*KafkaTemplate\b/;

export function checkLayers(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;

    const content = lines.join('\n');
    if (/@ControllerAdvice\b/.test(content)) continue;
    if (!CONTROLLER_RES.some(re => re.test(content))) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      // Repository direct access
      const repoField = line.match(REPO_FIELD_RE);
      const repoParam = line.match(REPO_PARAM_RE);
      if (repoField || repoParam) {
        const repoName = (repoField?.[2] || repoParam?.[1]);
        findings.push({
          severity: 'major',
          rule: 'layers',
          message: `Controller accessing Repository directly (${repoName})`,
          location: `${relativePath}:${i + 1}`,
        });
      }

      // KafkaTemplate direct in controller
      if (KAFKA_FIELD_RE.test(line) || KAFKA_PARAM_RE.test(line)) {
        findings.push({
          severity: 'major',
          rule: 'layers',
          message: 'Controller using KafkaTemplate directly (bypass Service layer)',
          location: `${relativePath}:${i + 1}`,
        });
      }
    }
  }

  return deduplicate(findings);
}

function deduplicate(findings) {
  const seen = new Set();
  return findings.filter(f => {
    const key = `${f.location}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
