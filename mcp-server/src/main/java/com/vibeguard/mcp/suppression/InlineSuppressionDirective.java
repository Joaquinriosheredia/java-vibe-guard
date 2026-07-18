package com.vibeguard.mcp.suppression;

import java.util.Set;

/**
 * A single {@code // vibe-guard: ignore RULE-ID[,RULE-ID...] -- justification} comment,
 * resolved to the 1-indexed source line it applies to.
 */
public record InlineSuppressionDirective(Set<String> ruleIds, String justification) {

    public boolean covers(String ruleId) {
        return ruleIds.contains(ruleId);
    }
}
