package com.vibeguard.mcp.suppression;

import com.vibeguard.mcp.dto.AnalysisResult;
import com.vibeguard.mcp.dto.Issue;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SuppressionReportFormatterTest {

    @Test
    void summaryFormatMatchesFindingsSuppressedReportedShape() {
        List<Issue> issues = List.of(
            new Issue("VIBE-001", "CRITICAL", "/repo/A.java", 1, "m").suppressedInline("legacy"),
            new Issue("VIBE-002", "CRITICAL", "/repo/A.java", 2, "m"),
            new Issue("VIBE-003", "MAJOR", "/repo/A.java", 3, "m"),
            new Issue("VIBE-004", "MAJOR", "/repo/A.java", 4, "m").suppressedByConfig(),
            new Issue("VIBE-005", "MAJOR", "/repo/A.java", 5, "m").suppressedByConfig()
        );
        AnalysisResult result = AnalysisResult.of("/repo", 1, issues);

        String summary = SuppressionReportFormatter.formatSummary(result);

        assertThat(summary).isEqualTo("5 findings\n3 suppressed\n2 reported");
    }

    @Test
    void verboseBlockForInlineSuppressionWithJustification() {
        Issue issue = new Issue("VIBE-001", "CRITICAL", "/repo/OrderService.java", 54, "m")
            .suppressedInline("legacy transaction");
        AnalysisResult result = AnalysisResult.of("/repo", 1, List.of(issue));

        String verbose = SuppressionReportFormatter.formatVerbose(result);

        assertThat(verbose).isEqualTo(
            "SUPPRESSED\nVIBE-001\nOrderService.java:54\nReason: inline — legacy transaction"
        );
    }

    @Test
    void verboseBlockForInlineSuppressionWithoutJustification() {
        Issue issue = new Issue("VIBE-001", "CRITICAL", "/repo/OrderService.java", 54, "m")
            .suppressedInline(null);
        AnalysisResult result = AnalysisResult.of("/repo", 1, List.of(issue));

        String verbose = SuppressionReportFormatter.formatVerbose(result);

        assertThat(verbose).isEqualTo("SUPPRESSED\nVIBE-001\nOrderService.java:54\nReason: inline");
    }

    @Test
    void verboseBlockForConfigSuppression() {
        Issue issue = new Issue("VIBE-004", "MAJOR", "/repo/Foo.java", 10, "m").suppressedByConfig();
        AnalysisResult result = AnalysisResult.of("/repo", 1, List.of(issue));

        String verbose = SuppressionReportFormatter.formatVerbose(result);

        assertThat(verbose).isEqualTo("SUPPRESSED\nVIBE-004\nConfig: vibeguard.config.json");
    }

    @Test
    void verboseListsMultipleSuppressedBlocksSeparatedByBlankLine() {
        List<Issue> issues = List.of(
            new Issue("VIBE-001", "CRITICAL", "/repo/OrderService.java", 54, "m")
                .suppressedInline("legacy transaction"),
            new Issue("VIBE-004", "MAJOR", "/repo/Foo.java", 10, "m").suppressedByConfig()
        );
        AnalysisResult result = AnalysisResult.of("/repo", 1, issues);

        String verbose = SuppressionReportFormatter.formatVerbose(result);

        assertThat(verbose).isEqualTo(
            "SUPPRESSED\nVIBE-001\nOrderService.java:54\nReason: inline — legacy transaction" +
            "\n\n" +
            "SUPPRESSED\nVIBE-004\nConfig: vibeguard.config.json"
        );
    }

    @Test
    void verboseIsEmptyWhenNothingIsSuppressed() {
        Issue issue = new Issue("VIBE-001", "CRITICAL", "/repo/A.java", 1, "m");
        AnalysisResult result = AnalysisResult.of("/repo", 1, List.of(issue));

        assertThat(SuppressionReportFormatter.formatVerbose(result)).isEmpty();
    }

    @Test
    void fullFormatCombinesSummaryAndVerboseBlocks() {
        List<Issue> issues = List.of(
            new Issue("VIBE-001", "CRITICAL", "/repo/OrderService.java", 54, "m")
                .suppressedInline("legacy transaction"),
            new Issue("VIBE-002", "CRITICAL", "/repo/A.java", 1, "m")
        );
        AnalysisResult result = AnalysisResult.of("/repo", 1, issues);

        String full = SuppressionReportFormatter.format(result, true);

        assertThat(full).isEqualTo(
            "2 findings\n1 suppressed\n1 reported\n\n" +
            "SUPPRESSED\nVIBE-001\nOrderService.java:54\nReason: inline — legacy transaction"
        );
    }

    @Test
    void nonVerboseFullFormatIsJustTheSummary() {
        Issue issue = new Issue("VIBE-001", "CRITICAL", "/repo/A.java", 1, "m").suppressedInline("x");
        AnalysisResult result = AnalysisResult.of("/repo", 1, List.of(issue));

        assertThat(SuppressionReportFormatter.format(result, false)).isEqualTo("1 findings\n1 suppressed\n0 reported");
    }
}
