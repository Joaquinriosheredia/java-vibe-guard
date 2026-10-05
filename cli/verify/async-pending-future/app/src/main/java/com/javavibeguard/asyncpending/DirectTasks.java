package com.javavibeguard.asyncpending;

import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/** N: P's body without @Async, called directly by the generator thread. */
@Component
public class DirectTasks {

    private final Downstream downstream;
    private final Counters counters;

    public DirectTasks(Downstream downstream, Counters counters) {
        this.downstream = downstream;
        this.counters = counters;
    }

    public CompletableFuture<Integer> pending(Task task) {
        task.startNs = System.nanoTime();
        counters.started.incrementAndGet();
        return downstream.call().thenApply(v -> v);
    }
}
