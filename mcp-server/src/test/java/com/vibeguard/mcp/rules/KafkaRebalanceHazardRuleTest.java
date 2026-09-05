package com.vibeguard.mcp.rules;

import com.vibeguard.mcp.dto.FileContent;
import com.vibeguard.mcp.dto.Issue;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class KafkaRebalanceHazardRuleTest {

    private final KafkaRebalanceHazardRule rule = new KafkaRebalanceHazardRule();

    // -------------------------------------------------------------------------
    // Fixture-based: real files, real patterns
    // -------------------------------------------------------------------------

    @Test
    void detectsAllKafkaHazardPatterns() throws IOException {
        String code = loadFixture("KafkaRebalanceHazardTruePositive.java");
        List<Issue> issues = rule.analyze(FileContent.of("KafkaRebalanceHazardTruePositive.java", code));

        assertThat(issues)
            .as("Expected multiple issues in the true-positive fixture")
            .isNotEmpty();

        assertThat(issues).allSatisfy(issue -> {
            assertThat(issue.ruleId()).isEqualTo("VIBE-006");
            assertThat(issue.severity()).isIn("CRITICAL", "WARNING");
        });
        assertThat(issues).anyMatch(i -> i.severity().equals("WARNING"))
            .as("Missing-groupId listeners must produce at least one WARNING");
        assertThat(issues).anyMatch(i -> i.severity().equals("CRITICAL"))
            .as("Blocking calls and empty groupId must produce at least one CRITICAL");
    }

    @Test
    void zeroFalsePositivesInSafeContexts() throws IOException {
        String code = loadFixture("KafkaRebalanceHazardFalsePositive.java");
        List<Issue> issues = rule.analyze(FileContent.of("KafkaRebalanceHazardFalsePositive.java", code));

        assertThat(issues)
            .as("No issues expected: valid groupIds, excluded methods, blocking outside listener, reactive without .block()")
            .isEmpty();
    }

    // -------------------------------------------------------------------------
    // True positives — @KafkaListener sin groupId → CRITICAL
    // -------------------------------------------------------------------------

    @Test
    void listenerWithoutGroupIdIsWarning() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(topics = "orders")
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        assertThat(issues).hasSize(1);
        assertThat(issues.getFirst().severity()).isEqualTo("WARNING");
        assertThat(issues.getFirst().ruleId()).isEqualTo("VIBE-006");
        assertThat(issues.getFirst().message()).contains("groupId not found in @KafkaListener annotation");
    }

    @Test
    void listenerWithEmptyGroupIdIsCritical() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(topics = "orders", groupId = "")
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        assertThat(issues).hasSize(1);
        assertThat(issues.getFirst().severity()).isEqualTo("CRITICAL");
        assertThat(issues.getFirst().message()).contains("groupId");
    }

    @Test
    void multiLineListenerWithoutGroupIdIsWarning() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(
                    topics = "orders",
                    containerFactory = "factory"
                )
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        assertThat(issues).hasSize(1);
        assertThat(issues.getFirst().severity()).isEqualTo("WARNING");
    }

    @Test
    void multiLineListenerWithGroupIdIsNotFlaggedForMissingGroupId() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(
                    topics = "orders",
                    groupId = "order-group"
                )
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    // -------------------------------------------------------------------------
    // id() acting as the effective groupId (framework default: idIsGroup() = true)
    // -------------------------------------------------------------------------

    @Test
    void listenerWithIdActingAsGroupIdIsNeverFlagged() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(id = "fooGroup", topics = "orders")
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void listenerWithIdAndIdIsGroupFalseStillWarns() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(id = "fooGroup", idIsGroup = false, topics = "orders")
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        assertThat(issues).hasSize(1);
        assertThat(issues.getFirst().severity()).isEqualTo("WARNING");
        assertThat(issues.getFirst().message()).contains("groupId not found in @KafkaListener annotation");
    }

    @Test
    void listenerWithEmptyGroupIdAndIdIsStillCritical() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(id = "fooGroup", groupId = "", topics = "orders")
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        assertThat(issues).hasSize(1);
        assertThat(issues.getFirst().severity()).isEqualTo("CRITICAL");
        assertThat(issues.getFirst().message()).contains("groupId");
    }

    // -------------------------------------------------------------------------
    // True positives — blocking call inside @KafkaListener → CRITICAL
    // -------------------------------------------------------------------------

    @Test
    void listenerWithThreadSleepIsCritical() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(topics = "t", groupId = "g")
                public void handle(String msg) throws InterruptedException {
                    Thread.sleep(1000);
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        assertThat(issues).hasSize(1);
        assertThat(issues.getFirst().severity()).isEqualTo("CRITICAL");
        assertThat(issues.getFirst().message()).contains("blocking call");
    }

    @Test
    void listenerWithRestTemplateIsCritical() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;
            import org.springframework.web.client.RestTemplate;

            public class Svc {
                private final RestTemplate restTemplate;
                Svc(RestTemplate rt) { this.restTemplate = rt; }

                @KafkaListener(topics = "t", groupId = "g")
                public void handle(String msg) {
                    restTemplate.getForObject("http://example.com", String.class);
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        assertThat(issues).hasSize(1);
        assertThat(issues.getFirst().severity()).isEqualTo("CRITICAL");
    }

    @Test
    void listenerWithWebClientBlockIsCritical() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;
            import org.springframework.web.reactive.function.client.WebClient;

            public class Svc {
                @KafkaListener(topics = "t", groupId = "g")
                public void handle(String msg, WebClient webClient) {
                    webClient.get().retrieve().bodyToMono(String.class).block();
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        assertThat(issues).hasSize(1);
        assertThat(issues.getFirst().severity()).isEqualTo("CRITICAL");
    }

    @Test
    void listenerWithFilesReadIsCritical() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;
            import java.nio.file.Files;
            import java.nio.file.Path;

            public class Svc {
                @KafkaListener(topics = "t", groupId = "g")
                public void handle(String path) throws Exception {
                    byte[] data = Files.readAllBytes(Path.of(path));
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        assertThat(issues).hasSize(1);
        assertThat(issues.getFirst().severity()).isEqualTo("CRITICAL");
    }

    @Test
    void listenerMissingGroupIdAndBlockingEmitsTwoIssues() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(topics = "alerts")
                public void handle(String msg) throws InterruptedException {
                    Thread.sleep(500);
                }
            }
            """;
        List<Issue> issues = rule.analyze(FileContent.of("Svc.java", code));
        // one WARNING for missing groupId + one CRITICAL for Thread.sleep
        assertThat(issues).hasSize(2);
        assertThat(issues).anyMatch(i -> i.severity().equals("WARNING") && i.message().contains("groupId not found"));
        assertThat(issues).anyMatch(i -> i.severity().equals("CRITICAL") && i.message().contains("blocking call"));
    }

    // -------------------------------------------------------------------------
    // False positives — inline, granular
    // -------------------------------------------------------------------------

    @Test
    void listenerWithValidGroupIdIsNeverFlaggedForMissingGroup() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(topics = "orders", groupId = "order-processor")
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void listenerWithPropertyGroupIdIsNeverFlagged() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(topics = "orders", groupId = "${kafka.consumer.group-id}")
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void blockingCallOutsideListenerIsNeverFlagged() {
        String code = """
            package com.example;

            public class Svc {
                public void poll() throws InterruptedException {
                    Thread.sleep(1000);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void testAnnotatedListenerIsNeverFlagged() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @org.junit.jupiter.api.Test
                @KafkaListener(topics = "t")
                public void testListener() throws InterruptedException {
                    Thread.sleep(100);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void commentWithGroupIdIsNeverFlagged() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(topics = "t", groupId = "valid-group")
                public void handle(String msg) {
                    // avoid groupId = "" — always use an explicit consumer group
                    System.out.println(msg);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void kafkaListenerInSingleLineBlockCommentIsNeverFlagged() {
        String code = """
            package com.example;

            public class Svc {
                /* @KafkaListener(topics = "orders") */
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void kafkaListenerInMultilineJavadocIsNeverFlagged() {
        String code = """
            package com.example;

            public class Svc {
                /**
                 * Example: {@code @KafkaListener(topics = "orders")}
                 * Do not use this pattern.
                 */
                public void handle(String msg) {
                    System.out.println(msg);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void stringLiteralWithBlockingPatternIsNeverFlagged() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;

            public class Svc {
                @KafkaListener(topics = "t", groupId = "valid-group")
                public void handle(String msg) {
                    String hint = "do not call Thread.sleep() or restTemplate.getForObject() here";
                    System.out.println(hint);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void reactiveListenerWithoutBlockIsNeverFlagged() {
        String code = """
            package com.example;
            import org.springframework.kafka.annotation.KafkaListener;
            import org.springframework.web.reactive.function.client.WebClient;
            import reactor.core.publisher.Mono;

            public class Svc {
                @KafkaListener(topics = "items", groupId = "item-group")
                public Mono<String> handle(String msg, WebClient webClient) {
                    return webClient.post().retrieve().bodyToMono(String.class);
                }
            }
            """;
        assertThat(rule.analyze(FileContent.of("Svc.java", code))).isEmpty();
    }

    @Test
    void nonJavaFileIgnored() {
        assertThat(rule.analyze(FileContent.of("consumer.yml", "@KafkaListener: true"))).isEmpty();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private String loadFixture(String name) throws IOException {
        String path = "/fixtures/" + name;
        try (InputStream is = getClass().getResourceAsStream(path)) {
            if (is == null) throw new IOException("Fixture not found: " + path);
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
