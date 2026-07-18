# Contributing to java-vibe-guard

Thank you for helping us protect Java and Spring Boot codebases against vibe coding anti-patterns! This document provides instructions on how to contribute new rules, construct the required test suites, adhere to our strict merge criteria, and report false positives.

---

## 🛠️ Adding a New Rule

A new rule must be added to both the **Node.js CLI analyzer** and the **Spring Boot MCP Server** to maintain feature parity across the stack.

### 1. Implementing in the CLI (`cli/`)

The CLI uses lightweight, regular-expression-based and context-heuristic static analysis.

1. **Create the rule file**: Add a new JavaScript module in `cli/src/rules/` (e.g., `cli/src/rules/your-new-rule.js`).
2. **Implement the rule**: Export a function matching this signature:
   ```javascript
   export function checkYourRule(fileContexts) {
     const findings = [];
     for (const { filePath, lines, relativePath } of fileContexts) {
       if (!filePath.endsWith('.java')) continue;
       
       // Scan the lines, skipping comments and string literals
       for (let i = 0; i < lines.length; i++) {
         const line = lines[i];
         const trimmed = line.trim();
         if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
         
         // Implement your detection logic here
         if (/* violation detected */) {
           findings.push({
             severity: 'critical', // 'critical', 'major', or 'warning'
             rule: 'your-rule-name',
             message: 'Explanation of why this is a production anti-pattern',
             location: `${relativePath}:${i + 1}`,
           });
         }
       }
     }
     return deduplicate(findings);
   }
   ```
   Use `relativePath`, not `fileName` — `fileName` is only the basename, so two files with
   the same name in different directories (e.g. `module-a/OrderService.java` and
   `module-b/OrderService.java`) would produce identical `location` strings, and
   `deduplicate()` (keyed on `` `${location}|${message}` ``) would silently drop one of
   the two real findings.

   **Exception — file-level findings**: if your check applies to a whole file with no
   single line to anchor to (e.g. "config file missing setting X"), omit `:${i + 1}` and
   use `location: relativePath` alone. This mirrors SARIF's own distinction between
   region-level and artifact-level results (see `cli/src/rules/kafka.js`, the
   "Kafka config without consumer group.id" check, for a working example).
3. **Register the rule**: Import and add your function to the `RULES` array inside [cli/src/scanner.js](file:///home/usuariojoaquin/java-vibe-guard/cli/src/scanner.js).

### 2. Implementing in the MCP Server (`mcp-server/`)

The MCP Server is implemented in Spring Boot and scans Java files using Java rules registered via Spring's Dependency Injection.

1. **Create the rule class**: Add a new Java class implementing the `Rule` interface in `mcp-server/src/main/java/com/vibeguard/mcp/rules/` (e.g., `YourNewRule.java`).
2. **Implement the `Rule` interface**:
   ```java
   package com.vibeguard.mcp.rules;

   import com.vibeguard.mcp.dto.FileContent;
   import com.vibeguard.mcp.dto.Issue;
   import org.springframework.stereotype.Component;
   import java.util.ArrayList;
   import java.util.List;

   @Component
   public class YourNewRule implements Rule {

       @Override
       public String id() {
           return "VIBE-008"; // Increment the rule code sequence
       }

       @Override
       public String description() {
           return "Short description of the anti-pattern";
       }

       @Override
       public List<Issue> analyze(FileContent file) {
           if (!file.path().endsWith(".java")) {
               return List.of();
           }
           
           List<Issue> issues = new ArrayList<>();
           List<String> lines = file.lines();
           
           // Implement your detection logic
           // Use patterns, context gates, and comments stripping
           
           return issues;
       }
   }
   ```
3. **Auto-registration**: By marking the class with `@Component`, Spring Boot will automatically detect, instantiate, and include it in the analysis engine pipeline.

---

## 🧪 Required Test Structure

To keep the detection engine reliable, every rule requires a robust test suite covering both true positives and false positives.

### CLI Test Structure

1. **Create fixtures**:
   - Add a file containing the anti-pattern under `cli/test-fixtures/` named `YourRuleTruePositive.java`.
   - Add a file containing safe variants of the same code structure under `cli/test-fixtures/` named `YourRuleFalsePositive.java`.
2. **Register fixtures**: Open [cli/run-validation.js](file:///home/usuariojoaquin/java-vibe-guard/cli/run-validation.js) and add your rule to the `FIXTURES` array:
   ```javascript
   {
     name: 'your-rule-name',
     checkFn: checkYourRule,
     files: [
       { path: 'YourRuleTruePositive.java', expectedBug: true },
       { path: 'YourRuleFalsePositive.java', expectedBug: false },
     ]
   }
   ```
3. **Run validation tests**:
   ```bash
   cd cli
   node run-validation.js
   ```

### MCP Server Test Structure

1. **Add resource fixtures**:
   - Save fixture files under `mcp-server/src/test/resources/fixtures/`: `YourRuleTruePositive.java` and `YourRuleFalsePositive.java`.
2. **Create the test class**:
   - Create a test class under `mcp-server/src/test/java/com/vibeguard/mcp/rules/` named `YourRuleTest.java`.
   - Use JUnit 5 and AssertJ to load the fixtures and assert findings:
     ```java
     package com.vibeguard.mcp.rules;

     import com.vibeguard.mcp.dto.FileContent;
     import com.vibeguard.mcp.dto.Issue;
     import org.junit.jupiter.api.Test;
     import java.io.IOException;
     import java.util.List;
     import static org.assertj.core.api.Assertions.assertThat;

     class YourRuleTest {
         private final YourRule rule = new YourRule();

         @Test
         void detectsAllTruePositives() throws IOException {
             String code = TestUtils.loadFixture("YourRuleTruePositive.java");
             List<Issue> issues = rule.analyze(FileContent.of("YourRuleTruePositive.java", code));
             assertThat(issues).isNotEmpty();
             assertThat(issues).allMatch(i -> i.severity().equals("CRITICAL"));
         }

         @Test
         void zeroFalsePositivesInSafeContexts() throws IOException {
             String code = TestUtils.loadFixture("YourRuleFalsePositive.java");
             List<Issue> issues = rule.analyze(FileContent.of("YourRuleFalsePositive.java", code));
             assertThat(issues).isEmpty();
         }
     }
     ```
3. **Run Maven tests**:
   ```bash
   cd mcp-server
   mvn test
   ```

---

## 🎯 Merge Criteria: 0 False Positives

To ensure our defense stack is integrated cleanly into developers' workflows and continuous integration (CI) pipelines, we enforce a strict **zero false positives** policy:

* **Precision over recall**: If a rule cannot guarantee with absolute certainty that a matched pattern is a bug in the given context, **do not flag it**. A clean, alert-fatigue-free pipeline is critical.
* **Contextual boundaries**: Ensure rules ignore test code (e.g. methods annotated with `@Test`), deprecated configurations, code inside comments (both single-line `//` and block `/* */`), and string literals.
* **No code, no review**: A PR will be automatically rejected if it contains new rules without corresponding True Positive and False Positive fixtures/tests showing a 100% precision score.

---

## 🐛 How to Report False Positives

If java-vibe-guard incorrectly flags safe code as a vulnerability, please report it immediately:

1. **Open a GitHub Issue** with the title prefix `[False Positive] RuleName (VIBE-XXX)`.
2. **Provide a minimal reproducible example (MRE)**:
   - Provide the exact snippet of safe Java code that was flagged.
   - Include any surrounding class-level/method-level annotations or imports.
3. **Detail the execution environment**:
   - Mention whether the issue was detected via the CLI or the MCP Server.
   - Provide the exact rule ID (e.g., `VIBE-003`).
