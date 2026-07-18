package com.vibeguard.mcp.suppression;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class InlineSuppressionParserTest {

    @Test
    void sameLineDirectiveAppliesToItsOwnLine() {
        List<String> lines = List.of(
            "public class Svc {",
            "    someCall(); // vibe-guard: ignore VIBE-001 -- legacy transaction",
            "}"
        );
        Map<Integer, List<InlineSuppressionDirective>> byLine = InlineSuppressionParser.parse(lines);

        assertThat(byLine).containsOnlyKeys(2);
        assertThat(byLine.get(2)).hasSize(1);
        InlineSuppressionDirective d = byLine.get(2).get(0);
        assertThat(d.ruleIds()).containsExactly("VIBE-001");
        assertThat(d.justification()).isEqualTo("legacy transaction");
    }

    @Test
    void previousLineDirectiveAppliesToNextLine() {
        List<String> lines = List.of(
            "public class Svc {",
            "    // vibe-guard: ignore VIBE-001 -- legacy transaction",
            "    someCall();",
            "}"
        );
        Map<Integer, List<InlineSuppressionDirective>> byLine = InlineSuppressionParser.parse(lines);

        assertThat(byLine).containsOnlyKeys(3);
        assertThat(byLine.get(3).get(0).ruleIds()).containsExactly("VIBE-001");
        assertThat(byLine.get(3).get(0).justification()).isEqualTo("legacy transaction");
    }

    @Test
    void previousLineDirectiveIndentedIsStillStandalone() {
        List<String> lines = List.of(
            "class Svc {",
            "        // vibe-guard: ignore VIBE-001",
            "    someCall();",
            "}"
        );
        Map<Integer, List<InlineSuppressionDirective>> byLine = InlineSuppressionParser.parse(lines);
        assertThat(byLine).containsOnlyKeys(3);
    }

    @Test
    void multipleRulesNoSpaceAfterComma() {
        List<String> lines = List.of(
            "// vibe-guard: ignore VIBE-001,VIBE-004 -- migration pending",
            "someCall();"
        );
        Map<Integer, List<InlineSuppressionDirective>> byLine = InlineSuppressionParser.parse(lines);
        assertThat(byLine.get(2).get(0).ruleIds()).containsExactlyInAnyOrder("VIBE-001", "VIBE-004");
        assertThat(byLine.get(2).get(0).justification()).isEqualTo("migration pending");
    }

    @Test
    void multipleRulesWithSpaceAfterComma() {
        List<String> lines = List.of(
            "// vibe-guard: ignore VIBE-001, VIBE-004 -- migration pending",
            "someCall();"
        );
        Map<Integer, List<InlineSuppressionDirective>> byLine = InlineSuppressionParser.parse(lines);
        assertThat(byLine.get(2).get(0).ruleIds()).containsExactlyInAnyOrder("VIBE-001", "VIBE-004");
    }

    @Test
    void directiveWithoutJustificationHasNullJustification() {
        List<String> lines = List.of(
            "someCall(); // vibe-guard: ignore VIBE-001"
        );
        Map<Integer, List<InlineSuppressionDirective>> byLine = InlineSuppressionParser.parse(lines);
        assertThat(byLine.get(1).get(0).justification()).isNull();
        assertThat(byLine.get(1).get(0).ruleIds()).containsExactly("VIBE-001");
    }

    @Test
    void directiveWithJustificationCapturesFreeText() {
        List<String> lines = List.of(
            "someCall(); // vibe-guard: ignore VIBE-001 -- reason with -- a dash inside"
        );
        Map<Integer, List<InlineSuppressionDirective>> byLine = InlineSuppressionParser.parse(lines);
        assertThat(byLine.get(1).get(0).justification()).isEqualTo("reason with -- a dash inside");
    }

    @Test
    void noDirectivesProducesEmptyMap() {
        List<String> lines = List.of("public class Svc {", "    someCall();", "}");
        assertThat(InlineSuppressionParser.parse(lines)).isEmpty();
    }

    @Test
    void standaloneDirectiveOnLastLineProducesNoUsableEntry() {
        List<String> lines = List.of(
            "public class Svc {",
            "// vibe-guard: ignore VIBE-001"
        );
        Map<Integer, List<InlineSuppressionDirective>> byLine = InlineSuppressionParser.parse(lines);
        // targets line 3, which does not exist in the file — never matches a real issue
        assertThat(byLine).containsOnlyKeys(3);
    }

    @Test
    void directiveIsCaseSensitiveToVibeGuardPrefixButToleratesExtraSpacing() {
        List<String> lines = List.of(
            "someCall();  //   vibe-guard:   ignore   VIBE-001   --   spaced out reason"
        );
        Map<Integer, List<InlineSuppressionDirective>> byLine = InlineSuppressionParser.parse(lines);
        assertThat(byLine.get(1).get(0).ruleIds()).containsExactly("VIBE-001");
        assertThat(byLine.get(1).get(0).justification()).isEqualTo("spaced out reason");
    }
}
