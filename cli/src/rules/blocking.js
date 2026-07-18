const ASYNC_ANNOTATIONS = [
  { re: /@Scheduled\b/,    name: '@Scheduled' },
  { re: /@KafkaListener\b/, name: '@KafkaListener' },
  { re: /@Async\b/,        name: '@Async' },
  { re: /@EventListener\b/, name: '@EventListener' },
];

// Future.get()/CompletableFuture.get() are intentionally NOT detected —
// distinguishing a blocking Future.get() from a non-blocking Optional.get()/
// Map.get()/etc. requires receiver type resolution, which this regex-based
// engine doesn't have. See issue #5 and the pending CLI/MCP architecture ADR.
const BLOCKING_PATTERNS = [
  { re: /\.\s*join\s*\(\s*\)/,          name: 'blocking .join()' },
  { re: /\.\s*block\s*\(\s*\)/,         name: 'blocking .block()' },
  { re: /\.\s*blockFirst\s*\(/,         name: 'blocking .blockFirst()' },
  { re: /\.\s*blockLast\s*\(/,          name: 'blocking .blockLast()' },
  { re: /Thread\s*\.\s*sleep\s*\(/,     name: 'Thread.sleep()' },
];

export function checkBlocking(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;

    // Collect positions of async annotations
    const annotatedPositions = [];
    for (let i = 0; i < lines.length; i++) {
      for (const { re, name } of ASYNC_ANNOTATIONS) {
        if (re.test(lines[i])) {
          annotatedPositions.push({ lineIdx: i, annotationName: name });
          break;
        }
      }
    }
    if (annotatedPositions.length === 0) continue;

    for (const { lineIdx, annotationName } of annotatedPositions) {
      const windowEnd = Math.min(lineIdx + 60, lines.length);
      for (let i = lineIdx + 1; i < windowEnd; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        // Stop if we hit another top-level annotation (new method boundary)
        if (i > lineIdx + 3 && trimmed.startsWith('@') && ASYNC_ANNOTATIONS.some(a => a.re.test(trimmed))) break;

        for (const { re, name } of BLOCKING_PATTERNS) {
          if (re.test(lines[i])) {
            findings.push({
              severity: 'critical',
              rule: annotationName === '@KafkaListener' ? 'blocking-kafka' : 'blocking',
              message: `${name} detected in ${annotationName} method`,
              location: `${relativePath}:${i + 1}`,
            });
          }
        }
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
