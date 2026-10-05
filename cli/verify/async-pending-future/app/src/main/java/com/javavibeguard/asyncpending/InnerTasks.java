package com.javavibeguard.asyncpending;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/** PN's inner @Async method, on the same default executor: returns the pending downstream future. */
@Component
public class InnerTasks {

    private final Downstream downstream;
    private final Counters counters;

    public InnerTasks(Downstream downstream, Counters counters) {
        this.downstream = downstream;
        this.counters = counters;
    }

    @Async
    public CompletableFuture<Integer> inner() {
        counters.lastKind.put(Thread.currentThread(), "INNER");
        counters.innerStarted.incrementAndGet();
        return downstream.call().thenApply(v -> v);
    }
}
