package com.example.saga;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import java.util.concurrent.TimeUnit;

@Service
public class KafkaSendTimeoutFalsePositive {

    private final KafkaTemplate<String, String> kafka;

    public KafkaSendTimeoutFalsePositive(KafkaTemplate<String, String> kafka) {
        this.kafka = kafka;
    }

    // Safe: explicit timeout — .get(timeout, TimeUnit) is exactly the fix
    // this rule wants, so it must never be flagged.
    public void publishWithTimeout(String orderId, String payload) throws Exception {
        kafka.send("orders", orderId, payload).get(5, TimeUnit.SECONDS);
    }

    // Safe: the same pattern, but inside a comment — not real code.
    // kafka.send("orders", orderId, payload).get();
    public void documentedButNotCalled() {
    }

    // Accepted false negative: .send(...) and .get() split across multiple
    // lines. This engine matches per physical line, so a chain broken across
    // lines is not detected — same trade-off as kafka.js's fixed-line-window
    // annotation checks. Documented in kafka.js above SEND_GET_NO_TIMEOUT_RE.
    public void publishMultiLine(String orderId, String payload) throws Exception {
        kafka.send("orders", orderId, payload)
            .get();
    }

    /**
     * Safe: the same pattern, but documented inside a multi-line JavaDoc
     * block comment — not real code. This is the exact shape that opened a
     * false positive before checkKafkaSendTimeout() tracked block-comment
     * state across lines: kafka.send("orders", orderId, payload).get();
     * Always use .get(timeout, TimeUnit) instead, as this method does.
     */
    public void publishWithTimeoutDocumented(String orderId, String payload) throws Exception {
        kafka.send("orders", orderId, payload).get(5, TimeUnit.SECONDS);
    }
}
