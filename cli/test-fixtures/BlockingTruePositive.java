package com.example;

import org.springframework.scheduling.annotation.Scheduled;
import java.util.concurrent.CompletableFuture;

public class BlockingTruePositive {
    @Scheduled(fixedDelay = 1000)
    public void runJob() {
        CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> "hello");
        try {
            String value = future.join(); // BUG: blocking call inside @Scheduled
            System.out.println(value);
        } catch (Exception e) {}
    }
}
