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
}
