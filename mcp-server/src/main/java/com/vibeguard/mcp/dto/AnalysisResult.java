package com.vibeguard.mcp.dto;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public record AnalysisResult(
    String projectPath,
    int totalFiles,
    int totalIssues,
    int reportedCount,
    int suppressedCount,
    List<Issue> issues,
    Map<String, Long> issuesBySeverity,
    String report
) {
    /**
     * @param issues the FULL finding list, including suppressed ones — suppressions
     *               are never dropped here, only flagged (see SuppressionProcessor)
     */
    public static AnalysisResult of(String projectPath, int totalFiles, List<Issue> issues) {
        Map<String, Long> bySeverity = issues.stream()
            .collect(Collectors.groupingBy(Issue::severity, Collectors.counting()));
        long suppressed = issues.stream().filter(Issue::suppressed).count();
        return new AnalysisResult(
            projectPath, totalFiles, issues.size(),
            issues.size() - (int) suppressed, (int) suppressed,
            issues, bySeverity, null
        );
    }

    public AnalysisResult withReport(String report) {
        return new AnalysisResult(
            projectPath, totalFiles, totalIssues, reportedCount, suppressedCount, issues, issuesBySeverity, report
        );
    }
}
