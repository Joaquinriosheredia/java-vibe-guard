package com.vibeguard.mcp.suppression;

import com.vibeguard.mcp.dto.AnalysisResult;
import com.vibeguard.mcp.dto.Issue;

import java.nio.file.Path;
import java.util.List;

/**
 * Renders {@link AnalysisResult} as human-readable text for MCP clients that ask for
 * {@code verbose=true}. Pure formatting — reads {@code suppressed}/{@code suppressedBy}/
 * {@code justification} off the (never-filtered) issue list, does not decide anything.
 */
public final class SuppressionReportFormatter {

    private SuppressionReportFormatter() {}

    public static String formatSummary(AnalysisResult result) {
        return result.totalIssues() + " findings\n"
            + result.suppressedCount() + " suppressed\n"
            + result.reportedCount() + " reported";
    }

    public static String formatVerbose(AnalysisResult result) {
        List<Issue> suppressed = result.issues().stream().filter(Issue::suppressed).toList();
        if (suppressed.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < suppressed.size(); i++) {
            if (i > 0) sb.append("\n\n");
            sb.append(formatBlock(suppressed.get(i)));
        }
        return sb.toString();
    }

    /** Full report: summary followed by the per-finding SUPPRESSED blocks. */
    public static String format(AnalysisResult result, boolean verbose) {
        String summary = formatSummary(result);
        if (!verbose) return summary;

        String details = formatVerbose(result);
        return details.isEmpty() ? summary : summary + "\n\n" + details;
    }

    private static String formatBlock(Issue issue) {
        StringBuilder sb = new StringBuilder();
        sb.append("SUPPRESSED\n");
        sb.append(issue.ruleId()).append('\n');

        if ("inline".equals(issue.suppressedBy())) {
            String fileName = Path.of(issue.file()).getFileName().toString();
            sb.append(fileName).append(':').append(issue.line()).append('\n');
            sb.append(issue.justification() != null
                ? "Reason: inline — " + issue.justification()
                : "Reason: inline");
        } else {
            sb.append("Config: vibeguard.config.json");
        }
        return sb.toString();
    }
}
