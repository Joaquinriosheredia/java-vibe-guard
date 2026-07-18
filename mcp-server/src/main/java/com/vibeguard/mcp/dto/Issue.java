package com.vibeguard.mcp.dto;

public record Issue(
    String ruleId,
    String severity,
    String file,
    int line,
    String message,
    boolean suppressed,
    String suppressedBy,   // "inline" | "config" | null
    String justification   // nullable — only ever set for inline suppressions
) {

    /**
     * Backward-compatible constructor used by every VIBE-001..007 rule. Rules never
     * know about suppressions — that is decided later by the post-processing layer —
     * so an Issue built this way always starts out unsuppressed.
     */
    public Issue(String ruleId, String severity, String file, int line, String message) {
        this(ruleId, severity, file, line, message, false, null, null);
    }

    public Issue suppressedInline(String justification) {
        return new Issue(ruleId, severity, file, line, message, true, "inline", justification);
    }

    public Issue suppressedByConfig() {
        return new Issue(ruleId, severity, file, line, message, true, "config", null);
    }
}
