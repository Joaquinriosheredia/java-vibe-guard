package com.example;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

// 0a (2.0.0): blocking.js dropped generic `.get()` in 7a18298 (issue #5:
// Optional.get() false positive), which also lost every real Future.get().
// Future.get() is now matched only on receivers this file declares with a
// Future type. Each method below must produce exactly one `blocking` finding:
//   - local CompletableFuture<T> declared and get() in the same @Async method
//     (the java-vibe-guard-demo OrderService.java:22 shape)
//   - a field declared Future<?>, get() inside @Scheduled
//   - `var` initialized from a CompletableFuture factory
//   - CompletableFuture.supplyAsync(...).get() chained on one line
@Service
public class BlockingFutureGetTruePositive {

    private final Future<?> pending = CompletableFuture.completedFuture("ready");

    @Async
    public void processOrder(Long id) throws Exception {
        CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> "order-" + id);
        String order = future.get();
        System.out.println(order);
    }

    @Scheduled(fixedRate = 5000)
    public void drainPending() throws Exception {
        Object done = pending.get();
        System.out.println(done);
    }

    @Async
    public void inferredVar() throws Exception {
        var cf = CompletableFuture.supplyAsync(() -> 42);
        System.out.println(cf.get());
    }

    @Async
    public void chained() throws Exception {
        Integer n = CompletableFuture.supplyAsync(() -> 7).get();
        System.out.println(n);
    }
}
