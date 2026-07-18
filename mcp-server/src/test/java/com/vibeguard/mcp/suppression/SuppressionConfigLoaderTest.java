package com.vibeguard.mcp.suppression;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class SuppressionConfigLoaderTest {

    @Test
    void loadsIgnoreAndExcludeFromConfigFile(@TempDir Path tempDir) throws IOException {
        Files.writeString(tempDir.resolve("vibeguard.config.json"), """
            {
              "ignore": ["VIBE-007"],
              "exclude": ["**/generated/**", "**/build/**", "**/target/**"]
            }
            """);

        SuppressionConfig config = SuppressionConfigLoader.load(tempDir);

        assertThat(config.ignore()).containsExactly("VIBE-007");
        assertThat(config.exclude()).containsExactly("**/generated/**", "**/build/**", "**/target/**");
    }

    @Test
    void missingConfigFileYieldsEmptyConfig(@TempDir Path tempDir) {
        SuppressionConfig config = SuppressionConfigLoader.load(tempDir);
        assertThat(config.ignore()).isEmpty();
        assertThat(config.exclude()).isEmpty();
    }

    @Test
    void malformedJsonYieldsEmptyConfigInsteadOfFailing(@TempDir Path tempDir) throws IOException {
        Files.writeString(tempDir.resolve("vibeguard.config.json"), "{ not valid json ");

        SuppressionConfig config = SuppressionConfigLoader.load(tempDir);

        assertThat(config.ignore()).isEmpty();
        assertThat(config.exclude()).isEmpty();
    }

    @Test
    void partialConfigWithOnlyIgnoreIsValid(@TempDir Path tempDir) throws IOException {
        Files.writeString(tempDir.resolve("vibeguard.config.json"), """
            { "ignore": ["VIBE-003"] }
            """);

        SuppressionConfig config = SuppressionConfigLoader.load(tempDir);

        assertThat(config.ignore()).containsExactly("VIBE-003");
        assertThat(config.exclude()).isEmpty();
    }
}
