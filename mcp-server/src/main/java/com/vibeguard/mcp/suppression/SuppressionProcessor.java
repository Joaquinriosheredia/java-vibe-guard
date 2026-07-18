package com.vibeguard.mcp.suppression;

import com.vibeguard.mcp.dto.Issue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Post-processing layer that decorates raw {@link Issue}s with suppression info.
 * Runs after all rules have finished and never removes an issue from the list —
 * every finding a rule produced is still present afterwards, just flagged as
 * {@code suppressed} (or not). Filtering into "reported vs suppressed" is strictly
 * an output-layer concern (see {@link SuppressionReportFormatter}), so this data is
 * safe to reuse later for audit/baseline features without touching the rule engine.
 *
 * <p>Resolution order per issue: inline comment first (most specific, has an explicit
 * justification), then project-wide config {@code ignore} by rule id, then config
 * {@code exclude} glob by file path.
 */
@Component
public class SuppressionProcessor {

    private static final Logger log = LoggerFactory.getLogger(SuppressionProcessor.class);

    public List<Issue> process(List<Issue> issues, String projectPath) {
        if (issues.isEmpty()) return issues;

        Path projectRoot = Path.of(projectPath);
        SuppressionConfig config = SuppressionConfigLoader.load(projectRoot);
        List<GlobMatcher> excludeMatchers = config.exclude().stream().map(GlobMatcher::new).toList();

        Map<String, Map<Integer, List<InlineSuppressionDirective>>> inlineByFile = new HashMap<>();

        List<Issue> result = new ArrayList<>(issues.size());
        for (Issue issue : issues) {
            InlineSuppressionDirective inline = findInlineDirective(issue, inlineByFile);
            if (inline != null) {
                result.add(issue.suppressedInline(inline.justification()));
                continue;
            }

            if (config.ignore().contains(issue.ruleId())) {
                result.add(issue.suppressedByConfig());
                continue;
            }

            if (excludeMatchers.stream().anyMatch(m -> m.matches(issue.file()))) {
                result.add(issue.suppressedByConfig());
                continue;
            }

            result.add(issue);
        }
        return result;
    }

    private InlineSuppressionDirective findInlineDirective(
        Issue issue,
        Map<String, Map<Integer, List<InlineSuppressionDirective>>> cache
    ) {
        Map<Integer, List<InlineSuppressionDirective>> directives =
            cache.computeIfAbsent(issue.file(), this::parseFile);

        List<InlineSuppressionDirective> atLine = directives.get(issue.line());
        if (atLine == null) return null;

        return atLine.stream().filter(d -> d.covers(issue.ruleId())).findFirst().orElse(null);
    }

    private Map<Integer, List<InlineSuppressionDirective>> parseFile(String filePath) {
        try {
            List<String> lines = Files.readAllLines(Path.of(filePath));
            return InlineSuppressionParser.parse(lines);
        } catch (IOException e) {
            log.warn("Could not read {} for inline suppression parsing: {}", filePath, e.getMessage());
            return Map.of();
        }
    }
}
