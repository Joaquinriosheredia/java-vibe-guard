package com.vibeguard.mcp.suppression;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses {@code // vibe-guard: ignore RULE-ID[,RULE-ID...] [-- justification]} comments
 * out of a file's source lines.
 *
 * <p>Two positions are supported:
 * <ul>
 *   <li><b>Same line</b> — the directive trails real code:
 *       {@code someCall(); // vibe-guard: ignore VIBE-001 -- legacy transaction}.
 *       Applies to that line.</li>
 *   <li><b>Line before</b> — the directive is alone on its line (nothing but the
 *       comment). Applies to the next line.</li>
 * </ul>
 */
public final class InlineSuppressionParser {

    private static final Pattern DIRECTIVE = Pattern.compile(
        "//\\s*vibe-guard\\s*:\\s*ignore\\s+" +
        "([A-Za-z]+-\\d+(?:\\s*,\\s*[A-Za-z]+-\\d+)*)" +
        "(?:\\s*--\\s*(.*))?\\s*$"
    );

    private InlineSuppressionParser() {}

    /**
     * @return map of 1-indexed source line → directives that apply to that line
     *         (normally one directive per line, but multiple are merged if present)
     */
    public static Map<Integer, List<InlineSuppressionDirective>> parse(List<String> lines) {
        Map<Integer, List<InlineSuppressionDirective>> byLine = new TreeMap<>();

        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher m = DIRECTIVE.matcher(line);
            if (!m.find()) continue;

            Set<String> ruleIds = new LinkedHashSet<>();
            for (String token : m.group(1).split(",")) {
                String trimmed = token.trim();
                if (!trimmed.isEmpty()) ruleIds.add(trimmed);
            }

            String justification = m.group(2) != null ? m.group(2).trim() : null;
            if (justification != null && justification.isEmpty()) justification = null;

            String prefix = line.substring(0, m.start());
            boolean standaloneComment = prefix.strip().isEmpty();
            int targetLine = standaloneComment ? (i + 2) : (i + 1);

            byLine.computeIfAbsent(targetLine, k -> new ArrayList<>())
                .add(new InlineSuppressionDirective(ruleIds, justification));
        }

        return byLine;
    }
}
