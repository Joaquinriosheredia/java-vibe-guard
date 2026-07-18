package com.vibeguard.mcp.tools;

import com.vibeguard.mcp.dto.AnalysisResult;
import com.vibeguard.mcp.engine.VibeGuardEngine;
import com.vibeguard.mcp.suppression.SuppressionReportFormatter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

@Component
public class VibeGuardMcpTools {

    private static final Logger log = LoggerFactory.getLogger(VibeGuardMcpTools.class);

    private final VibeGuardEngine engine;

    public VibeGuardMcpTools(VibeGuardEngine engine) {
        this.engine = engine;
    }

    @Tool(description = "Analyze a Java/Spring Boot project directory for vibe-coding anti-patterns. " +
        "Returns a structured list of issues with severity, file path, line number, and explanation. " +
        "Detects patterns such as blocking calls inside @Transactional methods. " +
        "Findings suppressed via inline '// vibe-guard: ignore VIBE-XXX' comments or vibeguard.config.json " +
        "are still included in the result (marked suppressed=true) — they are never silently dropped. " +
        "Set verbose=true to also get a human-readable report field listing every suppressed finding " +
        "and why it was suppressed.")
    public AnalysisResult analyzeProject(
        @ToolParam(description = "Absolute path to the Java/Spring Boot project directory to analyze")
        String projectPath,
        @ToolParam(description = "If true, include a human-readable summary and per-suppressed-finding " +
            "detail (rule, location, reason) in the 'report' field. Defaults to false.", required = false)
        Boolean verbose
    ) {
        log.info("analyzeProject called with path: {}, verbose: {}", projectPath, verbose);
        AnalysisResult result = engine.scan(projectPath);
        log.info("analyzeProject completed: {} issues found in {} files ({} reported, {} suppressed)",
            result.totalIssues(), result.totalFiles(), result.reportedCount(), result.suppressedCount());

        if (Boolean.TRUE.equals(verbose)) {
            result = result.withReport(SuppressionReportFormatter.format(result, true));
        }
        return result;
    }
}
