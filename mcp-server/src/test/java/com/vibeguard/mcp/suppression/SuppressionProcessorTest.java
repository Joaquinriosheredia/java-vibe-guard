package com.vibeguard.mcp.suppression;

import com.vibeguard.mcp.dto.AnalysisResult;
import com.vibeguard.mcp.dto.Issue;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SuppressionProcessorTest {

    private final SuppressionProcessor processor = new SuppressionProcessor();

    // -------------------------------------------------------------------------
    // Inline suppression — same line / previous line
    // -------------------------------------------------------------------------

    @Test
    void inlineSuppressionOnSameLineMarksIssueSuppressed(@TempDir Path tempDir) throws IOException {
        Path file = writeFile(tempDir, "OrderService.java", """
            public class OrderService {
                void charge() {
                    legacyCharge(); // vibe-guard: ignore VIBE-001 -- legacy transaction
                }
            }
            """);
        Issue issue = new Issue("VIBE-001", "CRITICAL", file.toString(), 3, "Blocking call");

        List<Issue> result = processor.process(List.of(issue), tempDir.toString());

        assertThat(result).hasSize(1);
        Issue processed = result.get(0);
        assertThat(processed.suppressed()).isTrue();
        assertThat(processed.suppressedBy()).isEqualTo("inline");
        assertThat(processed.justification()).isEqualTo("legacy transaction");
    }

    @Test
    void inlineSuppressionOnPreviousLineMarksNextLineSuppressed(@TempDir Path tempDir) throws IOException {
        Path file = writeFile(tempDir, "OrderService.java", """
            public class OrderService {
                // vibe-guard: ignore VIBE-001 -- legacy transaction
                void charge() {
                    legacyCharge();
                }
            }
            """);
        Issue issue = new Issue("VIBE-001", "CRITICAL", file.toString(), 3, "Blocking call");

        List<Issue> result = processor.process(List.of(issue), tempDir.toString());

        assertThat(result.get(0).suppressed()).isTrue();
        assertThat(result.get(0).suppressedBy()).isEqualTo("inline");
        assertThat(result.get(0).justification()).isEqualTo("legacy transaction");
    }

    // -------------------------------------------------------------------------
    // Multiple rules on one directive
    // -------------------------------------------------------------------------

    @Test
    void multipleRulesNoSpaceAfterCommaSuppressesBothRules(@TempDir Path tempDir) throws IOException {
        Path file = writeFile(tempDir, "Migration.java", """
            public class Migration {
                void run() {
                    legacyCall(); // vibe-guard: ignore VIBE-001,VIBE-004 -- migration pending
                }
            }
            """);
        Issue issue001 = new Issue("VIBE-001", "CRITICAL", file.toString(), 3, "msg1");
        Issue issue004 = new Issue("VIBE-004", "CRITICAL", file.toString(), 3, "msg2");

        List<Issue> result = processor.process(List.of(issue001, issue004), tempDir.toString());

        assertThat(result).allSatisfy(i -> {
            assertThat(i.suppressed()).isTrue();
            assertThat(i.suppressedBy()).isEqualTo("inline");
            assertThat(i.justification()).isEqualTo("migration pending");
        });
    }

    @Test
    void multipleRulesWithSpaceAfterCommaSuppressesBothRules(@TempDir Path tempDir) throws IOException {
        Path file = writeFile(tempDir, "Migration.java", """
            public class Migration {
                void run() {
                    legacyCall(); // vibe-guard: ignore VIBE-001, VIBE-004 -- migration pending
                }
            }
            """);
        Issue issue001 = new Issue("VIBE-001", "CRITICAL", file.toString(), 3, "msg1");
        Issue issue004 = new Issue("VIBE-004", "CRITICAL", file.toString(), 3, "msg2");

        List<Issue> result = processor.process(List.of(issue001, issue004), tempDir.toString());

        assertThat(result).allSatisfy(i -> assertThat(i.suppressed()).isTrue());
    }

    @Test
    void directiveDoesNotSuppressARuleItDoesNotList(@TempDir Path tempDir) throws IOException {
        Path file = writeFile(tempDir, "Migration.java", """
            public class Migration {
                void run() {
                    legacyCall(); // vibe-guard: ignore VIBE-001 -- migration pending
                }
            }
            """);
        Issue unrelated = new Issue("VIBE-002", "CRITICAL", file.toString(), 3, "unrelated");

        List<Issue> result = processor.process(List.of(unrelated), tempDir.toString());

        assertThat(result.get(0).suppressed()).isFalse();
        assertThat(result.get(0).suppressedBy()).isNull();
    }

    // -------------------------------------------------------------------------
    // Justification present / absent
    // -------------------------------------------------------------------------

    @Test
    void inlineSuppressionWithoutJustificationHasNullJustification(@TempDir Path tempDir) throws IOException {
        Path file = writeFile(tempDir, "Svc.java", """
            public class Svc {
                void run() {
                    legacyCall(); // vibe-guard: ignore VIBE-001
                }
            }
            """);
        Issue issue = new Issue("VIBE-001", "CRITICAL", file.toString(), 3, "msg");

        List<Issue> result = processor.process(List.of(issue), tempDir.toString());

        assertThat(result.get(0).suppressed()).isTrue();
        assertThat(result.get(0).suppressedBy()).isEqualTo("inline");
        assertThat(result.get(0).justification()).isNull();
    }

    // -------------------------------------------------------------------------
    // Config: global ignore by rule id
    // -------------------------------------------------------------------------

    @Test
    void configIgnoreSuppressesMatchingRuleGlobally(@TempDir Path tempDir) throws IOException {
        Files.writeString(tempDir.resolve("vibeguard.config.json"), """
            { "ignore": ["VIBE-007"] }
            """);
        Path file = writeFile(tempDir, "AsyncTask.java", """
            public class AsyncTask {
                void run() {
                    MDC.put("k", "v");
                }
            }
            """);
        Issue issue = new Issue("VIBE-007", "MAJOR", file.toString(), 3, "MDC leak");

        List<Issue> result = processor.process(List.of(issue), tempDir.toString());

        assertThat(result.get(0).suppressed()).isTrue();
        assertThat(result.get(0).suppressedBy()).isEqualTo("config");
        assertThat(result.get(0).justification()).isNull();
    }

    @Test
    void configIgnoreDoesNotAffectOtherRules(@TempDir Path tempDir) throws IOException {
        Files.writeString(tempDir.resolve("vibeguard.config.json"), """
            { "ignore": ["VIBE-007"] }
            """);
        Path file = writeFile(tempDir, "Svc.java", "public class Svc {}\n");
        Issue issue = new Issue("VIBE-001", "CRITICAL", file.toString(), 1, "msg");

        List<Issue> result = processor.process(List.of(issue), tempDir.toString());

        assertThat(result.get(0).suppressed()).isFalse();
    }

    // -------------------------------------------------------------------------
    // Config: exclude by glob
    // -------------------------------------------------------------------------

    @Test
    void configExcludeGlobSuppressesMatchingFilePath(@TempDir Path tempDir) throws IOException {
        Files.writeString(tempDir.resolve("vibeguard.config.json"), """
            { "exclude": ["**/generated/**"] }
            """);
        Path generatedDir = tempDir.resolve("src/main/generated");
        Files.createDirectories(generatedDir);
        Path file = writeFile(generatedDir, "AutoGen.java", "public class AutoGen {}\n");
        Issue issue = new Issue("VIBE-001", "CRITICAL", file.toString(), 1, "msg");

        List<Issue> result = processor.process(List.of(issue), tempDir.toString());

        assertThat(result.get(0).suppressed()).isTrue();
        assertThat(result.get(0).suppressedBy()).isEqualTo("config");
    }

    @Test
    void configExcludeGlobDoesNotAffectNonMatchingPaths(@TempDir Path tempDir) throws IOException {
        Files.writeString(tempDir.resolve("vibeguard.config.json"), """
            { "exclude": ["**/generated/**"] }
            """);
        Path file = writeFile(tempDir, "Svc.java", "public class Svc {}\n");
        Issue issue = new Issue("VIBE-001", "CRITICAL", file.toString(), 1, "msg");

        List<Issue> result = processor.process(List.of(issue), tempDir.toString());

        assertThat(result.get(0).suppressed()).isFalse();
    }

    // -------------------------------------------------------------------------
    // Summary counts
    // -------------------------------------------------------------------------

    @Test
    void summaryCountsMatchFindingsSuppressedAndReported(@TempDir Path tempDir) throws IOException {
        Files.writeString(tempDir.resolve("vibeguard.config.json"), """
            { "ignore": ["VIBE-007"] }
            """);
        Path file = writeFile(tempDir, "Svc.java", """
            public class Svc {
                void a() {
                    legacyCall(); // vibe-guard: ignore VIBE-001 -- legacy
                }
            }
            """);

        List<Issue> raw = List.of(
            new Issue("VIBE-001", "CRITICAL", file.toString(), 3, "inline-suppressed"),
            new Issue("VIBE-007", "MAJOR", file.toString(), 1, "config-suppressed"),
            new Issue("VIBE-002", "CRITICAL", file.toString(), 1, "reported-1"),
            new Issue("VIBE-003", "MAJOR", file.toString(), 1, "reported-2")
        );

        List<Issue> processed = processor.process(raw, tempDir.toString());
        AnalysisResult result = AnalysisResult.of(tempDir.toString(), 1, processed);

        assertThat(result.totalIssues()).isEqualTo(4);
        assertThat(result.suppressedCount()).isEqualTo(2);
        assertThat(result.reportedCount()).isEqualTo(2);
    }

    // -------------------------------------------------------------------------
    // Suppressed findings are never discarded
    // -------------------------------------------------------------------------

    @Test
    void suppressedFindingsRemainInTheInternalListWithSuppressedTrue(@TempDir Path tempDir) throws IOException {
        Path file = writeFile(tempDir, "Svc.java", """
            public class Svc {
                void a() {
                    legacyCall(); // vibe-guard: ignore VIBE-001 -- legacy
                }
            }
            """);
        List<Issue> raw = List.of(
            new Issue("VIBE-001", "CRITICAL", file.toString(), 3, "should be suppressed"),
            new Issue("VIBE-002", "CRITICAL", file.toString(), 1, "should stay reported")
        );

        List<Issue> processed = processor.process(raw, tempDir.toString());

        // Nothing is dropped: same size in, same size out.
        assertThat(processed).hasSize(raw.size());

        Issue suppressedOne = processed.stream().filter(i -> i.ruleId().equals("VIBE-001")).findFirst().orElseThrow();
        assertThat(suppressedOne.suppressed()).isTrue();
        assertThat(suppressedOne.message()).isEqualTo("should be suppressed");

        Issue reportedOne = processed.stream().filter(i -> i.ruleId().equals("VIBE-002")).findFirst().orElseThrow();
        assertThat(reportedOne.suppressed()).isFalse();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private Path writeFile(Path dir, String name, String content) throws IOException {
        Path file = dir.resolve(name);
        Files.writeString(file, content);
        return file;
    }
}
