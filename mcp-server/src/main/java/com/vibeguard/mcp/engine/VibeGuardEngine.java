package com.vibeguard.mcp.engine;

import com.vibeguard.mcp.dto.AnalysisResult;
import com.vibeguard.mcp.dto.FileContent;
import com.vibeguard.mcp.dto.Issue;
import com.vibeguard.mcp.rules.Rule;
import com.vibeguard.mcp.suppression.SuppressionProcessor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

@Component
public class VibeGuardEngine {

    private static final Logger log = LoggerFactory.getLogger(VibeGuardEngine.class);

    private final List<Rule> rules;
    private final SuppressionProcessor suppressionProcessor;

    public VibeGuardEngine(List<Rule> rules, SuppressionProcessor suppressionProcessor) {
        this.rules = rules;
        this.suppressionProcessor = suppressionProcessor;
        log.info("VibeGuardEngine initialized with {} rule(s): {}",
            rules.size(),
            rules.stream().map(Rule::id).toList());
    }

    public AnalysisResult scan(String projectPath) {
        Path root = Path.of(projectPath);
        if (!Files.exists(root) || !Files.isDirectory(root)) {
            throw new IllegalArgumentException("Path does not exist or is not a directory: " + projectPath);
        }

        List<Path> javaFiles = collectJavaFiles(root);
        log.info("Scanning {} Java files under {}", javaFiles.size(), projectPath);

        List<Issue> allIssues = new ArrayList<>();
        for (Path file : javaFiles) {
            try {
                String content = Files.readString(file);
                FileContent fc = FileContent.of(file.toString(), content);
                for (Rule rule : rules) {
                    List<Issue> found = rule.analyze(fc);
                    if (!found.isEmpty()) {
                        log.debug("Rule {} found {} issue(s) in {}", rule.id(), found.size(), file);
                    }
                    allIssues.addAll(found);
                }
            } catch (IOException e) {
                log.warn("Could not read file {}: {}", file, e.getMessage());
            }
        }

        List<Issue> processedIssues = suppressionProcessor.process(allIssues, projectPath);
        return AnalysisResult.of(projectPath, javaFiles.size(), processedIssues);
    }

    private List<Path> collectJavaFiles(Path root) {
        try (Stream<Path> stream = Files.walk(root)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(p -> p.toString().endsWith(".java"))
                .filter(p -> !p.toString().contains("/.git/"))
                .filter(p -> !p.toString().contains("/target/"))
                .filter(p -> !p.toString().contains("/build/"))
                .filter(p -> !p.toString().contains("/test/"))
                .filter(p -> !p.toString().contains("/tests/"))
                .filter(p -> {
                    String name = p.getFileName().toString();
                    return !name.endsWith("Test.java")
                        && !name.endsWith("Tests.java")
                        && !name.endsWith("IT.java")
                        && !name.endsWith("Spec.java");
                })
                .toList();
        } catch (IOException e) {
            log.error("Failed to walk directory {}: {}", root, e.getMessage());
            return List.of();
        }
    }
}
