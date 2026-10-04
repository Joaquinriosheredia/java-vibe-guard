package com.javavibeguard.blocking;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/**
 * The @Async methods under test. All wait for the same 200 ms downstream call.
 *
 * <p>A and B are {@code void} and complete a future passed by the caller. They cannot
 * return the future: Spring's AsyncExecutionInterceptor calls {@code Future.get()} on a
 * returned future <em>on the executor thread</em> (spring-aop 6.1.6), so a returned,
 * still-pending future holds the thread exactly like join(). {@link #returningFuture}
 * is that case (exploratory variant B0, see the results).
 */
@Component
public class AsyncTasks {

    private final Downstream downstream;
    private final Counters counters;

    public AsyncTasks(Downstream downstream, Counters counters) {
        this.downstream = downstream;
        this.counters = counters;
    }

    /** Variants A/C/D: the rule's pattern (`.join()` inside @Async). Holds the thread 200 ms. */
    @Async
    public void blocking(long submitNs, CompletableFuture<TaskTiming> result) {
        long startNs = System.nanoTime();
        counters.started.incrementAndGet();
        downstream.call().join();
        counters.finished.incrementAndGet();
        result.complete(new TaskTiming(submitNs, startNs, System.nanoTime()));
    }

    /** Variant B: same work, the thread is released as soon as the call is issued. */
    @Async
    public void nonBlocking(long submitNs, CompletableFuture<TaskTiming> result) {
        long startNs = System.nanoTime();
        counters.started.incrementAndGet();
        downstream.call().thenAccept(v -> {
            counters.finished.incrementAndGet();
            result.complete(new TaskTiming(submitNs, startNs, System.nanoTime()));
        });
    }

    /** Exploratory B0: B as first pre-registered (future composed and returned, no join()). */
    @Async
    public CompletableFuture<TaskTiming> returningFuture(long submitNs) {
        long startNs = System.nanoTime();
        counters.started.incrementAndGet();
        return downstream.call().thenApply(v -> {
            counters.finished.incrementAndGet();
            return new TaskTiming(submitNs, startNs, System.nanoTime());
        });
    }

    public record TaskTiming(long submitNs, long startNs, long endNs) {
    }
}
