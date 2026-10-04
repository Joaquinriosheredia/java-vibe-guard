package com.javavibeguard.blockingkafka;

import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Simulated downstream call: a future completed after {@code ms} by its own scheduler. */
@Component
public class Downstream {

    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2, r -> {
        Thread t = new Thread(r, "downstream");
        t.setDaemon(true);
        return t;
    });

    public CompletableFuture<Integer> call(long ms) {
        CompletableFuture<Integer> f = new CompletableFuture<>();
        scheduler.schedule(() -> f.complete(1), ms, TimeUnit.MILLISECONDS);
        return f;
    }
}
