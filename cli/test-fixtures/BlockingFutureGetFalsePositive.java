package com.example;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// 0a (2.0.0): the receiver-typed Future.get() match must not bring back
// issue #5. Every method below must produce ZERO findings:
//   - Optional.get() and Map.get() (the original issue #5 false positive)
//   - a timed future.get(timeout, unit): bounded, it is the recommended fix
//   - a Future declared only inside a comment
//   - a String whose name merely contains "future"
@Service
public class BlockingFutureGetFalsePositive {

    private final Map<String, String> cache = Map.of("k", "v");

    @Async
    public void optionalAndMap(Optional<String> maybe) {
        String a = maybe.get();
        String b = cache.get("k");
        System.out.println(a + b);
    }

    @Async
    public void timedGet() throws Exception {
        CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> "x");
        String v = future.get(5, TimeUnit.SECONDS);
        System.out.println(v);
    }

    @Async
    public void commentedDeclaration(Optional<String> handle) {
        // CompletableFuture<String> handle = ...;  (old code, removed)
        System.out.println(handle.get());
    }

    @Async
    public void similarName(Optional<String> futureName) {
        System.out.println(futureName.get());
    }
}
