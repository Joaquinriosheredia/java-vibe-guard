package com.example;

import org.springframework.scheduling.annotation.Async;
import org.springframework.context.event.EventListener;
import java.util.concurrent.CompletableFuture;

// Regression coverage for A3.1 (issue #11): confirms the stripComments() fix
// in blocking.js's BLOCKING_PATTERNS window scan does not affect real
// detection on the shared engine's other two anchors. @Scheduled and
// @KafkaListener already have dedicated true-positive fixtures
// (BlockingTruePositive.java, KafkaBlockingProbe.java) — @Async and
// @EventListener did not, and the fix touches the pattern-match site all
// four anchors funnel through, so both are covered here explicitly.
public class BlockingAsyncEventListenerTruePositive {
    @Async
    public void runAsyncJob() {
        CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> "hello");
        future.join(); // BUG: blocking call inside @Async
    }

    @EventListener
    public void onOrderCreated(Object event) {
        try {
            Thread.sleep(50); // BUG: blocking call inside @EventListener
        } catch (InterruptedException e) {}
    }
}
