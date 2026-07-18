package com.vibeguard.mcp.engine;

import com.vibeguard.mcp.dto.AnalysisResult;
import com.vibeguard.mcp.dto.Issue;
import com.vibeguard.mcp.rules.Rule;
import com.vibeguard.mcp.rules.TransactionalAsyncRule;
import com.vibeguard.mcp.suppression.SuppressionProcessor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end wiring check: a real rule (VIBE-001) plus the suppression
 * post-processing layer, run through the actual engine — not the rule or the
 * processor in isolation. Confirms VIBE-001 itself was never touched: it still
 * fires exactly as before, suppression only decorates its output afterwards.
 */
class VibeGuardEngineSuppressionTest {

    @Test
    void inlineSuppressedFindingSurvivesTheFullPipelineButIsMarkedSuppressed(@TempDir Path project) throws IOException {
        Files.writeString(project.resolve("OrderService.java"), """
            package com.example;

            import org.springframework.transaction.annotation.Transactional;
            import java.util.concurrent.Future;

            public class OrderService {
                @Transactional
                public void charge(Future<String> future) throws Exception {
                    future.get(); // vibe-guard: ignore VIBE-001 -- legacy transaction
                }
            }
            """);

        VibeGuardEngine engine = new VibeGuardEngine(List.of(new TransactionalAsyncRule()), new SuppressionProcessor());
        AnalysisResult result = engine.scan(project.toString());

        assertThat(result.totalIssues()).isEqualTo(1);
        assertThat(result.suppressedCount()).isEqualTo(1);
        assertThat(result.reportedCount()).isEqualTo(0);

        Issue issue = result.issues().get(0);
        assertThat(issue.ruleId()).isEqualTo("VIBE-001");
        assertThat(issue.suppressed()).isTrue();
        assertThat(issue.suppressedBy()).isEqualTo("inline");
        assertThat(issue.justification()).isEqualTo("legacy transaction");
    }

    @Test
    void configExcludeAppliesAcrossTheWholeProjectScan(@TempDir Path project) throws IOException {
        Files.writeString(project.resolve("vibeguard.config.json"), """
            { "exclude": ["**/generated/**"] }
            """);
        Path generated = project.resolve("generated");
        Files.createDirectories(generated);
        Files.writeString(generated.resolve("AutoGen.java"), """
            package com.example;
            import org.springframework.transaction.annotation.Transactional;
            import java.util.concurrent.Future;
            public class AutoGen {
                @Transactional
                public void charge(Future<String> future) throws Exception {
                    future.get();
                }
            }
            """);

        VibeGuardEngine engine = new VibeGuardEngine(List.of(new TransactionalAsyncRule()), new SuppressionProcessor());
        AnalysisResult result = engine.scan(project.toString());

        assertThat(result.totalIssues()).isEqualTo(1);
        assertThat(result.issues().get(0).suppressed()).isTrue();
        assertThat(result.issues().get(0).suppressedBy()).isEqualTo("config");
    }

    @Test
    void unsuppressedFindingIsUnaffected(@TempDir Path project) throws IOException {
        Files.writeString(project.resolve("OrderService.java"), """
            package com.example;
            import org.springframework.transaction.annotation.Transactional;
            import java.util.concurrent.Future;
            public class OrderService {
                @Transactional
                public void charge(Future<String> future) throws Exception {
                    future.get();
                }
            }
            """);

        VibeGuardEngine engine = new VibeGuardEngine(List.of(new TransactionalAsyncRule()), new SuppressionProcessor());
        AnalysisResult result = engine.scan(project.toString());

        assertThat(result.totalIssues()).isEqualTo(1);
        assertThat(result.reportedCount()).isEqualTo(1);
        assertThat(result.suppressedCount()).isEqualTo(0);
        assertThat(result.issues().get(0).suppressed()).isFalse();
    }
}
