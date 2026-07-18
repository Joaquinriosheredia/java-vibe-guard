package com.vibeguard.mcp.suppression;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class SuppressionConfigLoader {

    private static final Logger log = LoggerFactory.getLogger(SuppressionConfigLoader.class);
    private static final String CONFIG_FILE_NAME = "vibeguard.config.json";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SuppressionConfigLoader() {}

    /**
     * Loads {@code vibeguard.config.json} from the project root. Missing file or
     * malformed JSON are not fatal — the scan proceeds with an empty config (no
     * global ignores, no excludes) rather than blocking adoption on a config typo.
     */
    public static SuppressionConfig load(Path projectRoot) {
        Path configPath = projectRoot.resolve(CONFIG_FILE_NAME);
        if (!Files.isRegularFile(configPath)) {
            return SuppressionConfig.empty();
        }
        try {
            String content = Files.readString(configPath);
            SuppressionConfig config = MAPPER.readValue(content, SuppressionConfig.class);
            return config == null ? SuppressionConfig.empty() : config;
        } catch (IOException e) {
            log.warn("Could not parse {}: {} — proceeding without config suppressions", configPath, e.getMessage());
            return SuppressionConfig.empty();
        }
    }
}
