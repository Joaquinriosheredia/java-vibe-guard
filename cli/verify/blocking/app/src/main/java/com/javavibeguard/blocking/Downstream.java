package com.javavibeguard.blocking;

import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Simulated downstream call: a future completed after {@link #LATENCY_MS} by its own scheduler. */
@Component
public class Downstream {

    static final long LATENCY_MS = 200;

    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2, r -> {
        Thread t = new Thread(r, "downstream");
        t.setDaemon(true);
        return t;
    });

    public CompletableFuture<Integer> call() {
        CompletableFuture<Integer> f = new CompletableFuture<>();
        scheduler.schedule(() -> f.complete(1), LATENCY_MS, TimeUnit.MILLISECONDS);
        return f;
    }
}
