package com.example;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import java.util.concurrent.CompletableFuture;

public class KafkaBlockingProbe {
    @KafkaListener(topics = "orders", groupId = "order-group")
    @RetryableTopic(attempts = "3")
    public void consume(String message) {
        CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> message);
        future.join(); // BUG: blocking call inside a Kafka listener method
    }
}
