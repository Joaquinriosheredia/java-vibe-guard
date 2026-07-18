package com.vibeguard.mcp.suppression;

import java.util.List;

/**
 * Project-level suppression config, loaded from {@code vibeguard.config.json} at the
 * root of the scanned project.
 *
 * <pre>
 * {
 *   "ignore": ["VIBE-007"],
 *   "exclude": ["**&#47;generated/**", "**&#47;build/**", "**&#47;target/**"]
 * }
 * </pre>
 */
public record SuppressionConfig(List<String> ignore, List<String> exclude) {

    public static SuppressionConfig empty() {
        return new SuppressionConfig(List.of(), List.of());
    }

    public SuppressionConfig {
        ignore = ignore == null ? List.of() : List.copyOf(ignore);
        exclude = exclude == null ? List.of() : List.copyOf(exclude);
    }
}
