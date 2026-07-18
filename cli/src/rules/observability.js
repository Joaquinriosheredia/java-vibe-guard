const MAPPING_RES = [
  /@GetMapping\b/,
  /@PostMapping\b/,
  /@PutMapping\b/,
  /@DeleteMapping\b/,
  /@PatchMapping\b/,
  /@RequestMapping\b/,
];

const LOG_RES = [
  /\blog\s*\.\s*(info|warn|error|debug|trace)\s*\(/i,
  /\blogger\s*\.\s*(info|warn|error|debug|trace)\s*\(/i,
  /\bLOG\s*\.\s*(info|warn|error|debug|trace)\s*\(/,
  /\bLOGGER\s*\.\s*(info|warn|error|debug|trace)\s*\(/,
  /log\.at(Info|Warn|Error|Debug)\b/,
];

export function checkObservability(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;

    const content = lines.join('\n');
    if (!/@RestController\b/.test(content) && !/@Controller\b/.test(content)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (!MAPPING_RES.some(re => re.test(line))) continue;

      // Extract the method body: find method signature and scan until its closing brace
      const bodyLines = [];
      let braceCount = 0;
      let methodStarted = false;

      for (let j = i; j < Math.min(i + 60, lines.length); j++) {
        bodyLines.push(lines[j]);
        const opens  = (lines[j].match(/\{/g) || []).length;
        const closes = (lines[j].match(/\}/g) || []).length;
        if (opens > 0) methodStarted = true;
        braceCount += opens - closes;
        if (methodStarted && braceCount <= 0) break;
      }

      const body = bodyLines.join('\n');
      // Skip if method is abstract / interface (no braces)
      if (!body.includes('{')) continue;

      const hasLogging = LOG_RES.some(re => re.test(body));
      if (!hasLogging) {
        findings.push({
          severity: 'warning',
          rule: 'observability',
          message: 'Endpoint without structured logging',
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
