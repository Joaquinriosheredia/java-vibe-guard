package com.example.saga;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class KafkaSendTimeoutTruePositive {

    private final KafkaTemplate<String, String> kafka;

    public KafkaSendTimeoutTruePositive(KafkaTemplate<String, String> kafka) {
        this.kafka = kafka;
    }

    // BUG: .send(...).get() with no timeout blocks the calling thread
    // indefinitely if the broker is slow/unavailable (Java-Production-Labs
    // SagaOrderService.java:45, commit 01cee18). Nested parens in the
    // payload (saved.getId().toString()) are the real-world shape this
    // rule's regex is built to survive.
    public void startSaga(Order saved) throws Exception {
        kafka.send("saga.order.created", saved.getId().toString(), "payload").get();
    }

    // Same bug, extra whitespace around "." and "get" — the rule must
    // tolerate arbitrary spacing as long as the chain stays on one line.
    public void publish(Order saved) throws Exception {
        kafka.send("saga.order.created", saved.getId().toString(), "payload") .get ();
    }

    interface Order {
        String getId();
    }
}
