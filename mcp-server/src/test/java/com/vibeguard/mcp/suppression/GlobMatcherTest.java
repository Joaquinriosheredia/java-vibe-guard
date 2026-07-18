package com.vibeguard.mcp.suppression;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GlobMatcherTest {

    @Test
    void doubleStarMatchesAcrossDirectoryBoundaries() {
        GlobMatcher m = new GlobMatcher("**/generated/**");
        assertThat(m.matches("/home/user/project/src/main/generated/Foo.java")).isTrue();
        assertThat(m.matches("/home/user/project/generated/nested/deep/Bar.java")).isTrue();
    }

    @Test
    void doubleStarPatternDoesNotMatchUnrelatedPath() {
        GlobMatcher m = new GlobMatcher("**/generated/**");
        assertThat(m.matches("/home/user/project/src/main/java/Foo.java")).isFalse();
    }

    @Test
    void matchesBuildAndTargetPatterns() {
        assertThat(new GlobMatcher("**/build/**").matches("/repo/module/build/classes/Foo.java")).isTrue();
        assertThat(new GlobMatcher("**/target/**").matches("/repo/module/target/classes/Foo.java")).isTrue();
    }

    @Test
    void singleStarDoesNotCrossDirectoryBoundary() {
        GlobMatcher m = new GlobMatcher("/repo/*.java");
        assertThat(m.matches("/repo/Foo.java")).isTrue();
        assertThat(m.matches("/repo/sub/Foo.java")).isFalse();
    }
}
