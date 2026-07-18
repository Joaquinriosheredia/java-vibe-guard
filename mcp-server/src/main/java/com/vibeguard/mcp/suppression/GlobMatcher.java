package com.vibeguard.mcp.suppression;

import java.util.regex.Pattern;

/**
 * Minimal, dependency-free glob matcher for {@code exclude} patterns in
 * {@code vibeguard.config.json} (e.g. {@code **&#47;generated/**}).
 *
 * <p>Implemented as an explicit glob-to-regex conversion (rather than
 * {@code java.nio.file.PathMatcher}) so matching is predictable against absolute
 * path strings and independent of filesystem-specific glob quirks — and so it can be
 * unit tested directly.
 *
 * <p>{@code **} matches any sequence of characters, including {@code /}.
 * {@code *} matches any sequence of characters except {@code /}.
 */
public final class GlobMatcher {

    private final Pattern pattern;

    public GlobMatcher(String glob) {
        this.pattern = Pattern.compile(toRegex(glob));
    }

    public boolean matches(String path) {
        String normalized = path.replace('\\', '/');
        return pattern.matcher(normalized).matches();
    }

    private static String toRegex(String glob) {
        StringBuilder sb = new StringBuilder();
        int i = 0;
        while (i < glob.length()) {
            char c = glob.charAt(i);
            if (c == '*') {
                if (i + 1 < glob.length() && glob.charAt(i + 1) == '*') {
                    sb.append(".*");
                    i += 2;
                } else {
                    sb.append("[^/]*");
                    i++;
                }
            } else if (c == '?') {
                sb.append('.');
                i++;
            } else if ("\\.[]{}()+-^$|".indexOf(c) >= 0) {
                sb.append('\\').append(c);
                i++;
            } else {
                sb.append(c);
                i++;
            }
        }
        return sb.toString();
    }
}
