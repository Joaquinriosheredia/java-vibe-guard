const ZOOKEEPER_IMAGE_RES = [
  /confluentinc\/cp-zookeeper/i,
  /bitnami\/zookeeper/i,
  /wurstmeister\/zookeeper/i,
  /zookeeper\s*:/,
];

export function checkKafka(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    // --- YAML: Zookeeper detection ---
    if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('#')) continue;
        for (const re of ZOOKEEPER_IMAGE_RES) {
          if (re.test(lines[i])) {
            findings.push({
              severity: 'warning',
              rule: 'kafka',
              message: 'Kafka using Zookeeper (deprecated in Kafka 3.x — migrate to KRaft)',
              location: `${relativePath}:${i + 1}`,
            });
            break;
          }
        }
      }
      continue;
    }

    // --- Java files ---
    if (!filePath.endsWith('.java')) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/@KafkaListener\b/.test(line)) continue;

      // Collect the full annotation (may span multiple lines)
      let annotationBlock = '';
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        annotationBlock += lines[j] + ' ';
        if (lines[j].includes(')')) break;
      }

      // Missing groupId
      if (!/groupId\s*=|group\.id/.test(annotationBlock)) {
        findings.push({
          severity: 'warning',
          rule: 'kafka',
          message: '@KafkaListener without explicit groupId',
          location: `${relativePath}:${i + 1}`,
        });
      }

      // No retry / DLQ strategy in surrounding context
      const ctx = lines.slice(Math.max(0, i - 3), Math.min(i + 6, lines.length)).join('\n');
      if (!/@RetryableTopic\b/.test(ctx) && !/@DltHandler\b/.test(ctx)) {
        findings.push({
          severity: 'warning',
          rule: 'kafka',
          message: '@KafkaListener without @RetryableTopic or DLQ — failed messages will be lost',
          location: `${relativePath}:${i + 1}`,
        });
      }
    }
  }

  // --- Properties/yml: Kafka config without group.id ---
  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.properties') && !filePath.endsWith('.yml') && !filePath.endsWith('.yaml')) continue;
    const content = lines.join('\n');
    if (
      /spring\.kafka|kafka\.bootstrap|bootstrap-servers/i.test(content) &&
      !/group[.-]id/i.test(content)
    ) {
      findings.push({
        severity: 'warning',
        rule: 'kafka',
        message: 'Kafka config without consumer group.id',
        // File-level finding, not line-level: this check inspects the whole
        // config file for the presence of settings, with no single line to
        // anchor to. location intentionally omits ":line" — SARIF itself
        // distinguishes region-level vs artifact-level results, so this
        // split is semantically correct and reusable when SARIF output lands.
        location: relativePath,
      });
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
