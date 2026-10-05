package com.javavibeguard.asyncpending;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/**
 * The @Async methods under test (PREREGISTRATION.md, Variants). None has a join() or get()
 * in its body; they differ only in the future they return.
 */
@Component
public class PendingTasks {

    private final Downstream downstream;
    private final Counters counters;
    private final InnerTasks inner;

    public PendingTasks(Downstream downstream, Counters counters, InnerTasks inner) {
        this.downstream = downstream;
        this.counters = counters;
        this.inner = inner;
    }

    /** P, P16, V: returns the downstream future, still pending (completes ~200 ms later). */
    @Async
    public CompletableFuture<Integer> pending(Task task) {
        enter(task, "OUTER");
        return downstream.call().thenApply(v -> v);
    }

    /** K: the same call, completed through the caller's future; returns an already-completed future. */
    @Async
    public CompletableFuture<Integer> completed(Task task, CompletableFuture<Integer> done) {
        enter(task, "OUTER");
        downstream.call().thenAccept(done::complete);
        return CompletableFuture.completedFuture(0);
    }

    /** PN: returns the future of another @Async method that runs on the same executor. */
    @Async
    public CompletableFuture<Integer> outer(Task task) {
        enter(task, "OUTER");
        return inner.inner();
    }

    private void enter(Task task, String kind) {
        task.startNs = System.nanoTime();
        counters.lastKind.put(Thread.currentThread(), kind);
        counters.started.incrementAndGet();
    }
}
