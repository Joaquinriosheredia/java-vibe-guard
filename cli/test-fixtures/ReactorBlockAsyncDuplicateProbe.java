package com.example;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

// 0a (2.0.0) dedup regression fixture: Mono.block() inside an @Async method
// of a Spring bean matches BOTH blocking.js (@Async anchor) and
// reactor-block.js (bean + reactor import) on the same line — the
// java-vibe-guard-demo ReactiveController.java:14 shape. The Thread.sleep() on
// another line is a different call and must still be reported under blocking.
// 2.4.0: reactor-block no longer reports an @Async method when the scanned tree has
// @EnableAsync (it runs on the task executor, not on a Reactor thread), so the
// .block() is reported once, under blocking (its @Async anchor): 2 blocking findings.
// Scanned without @EnableAsync, @Async is inert: blocking reports nothing and
// reactor-block reports the .block() as a warning (thread unknown). The dedup itself is
// covered by ReactorBlockScheduledDuplicateProbe.java.
@Service
public class ReactorBlockAsyncDuplicateProbe {

    @Async
    public String load() throws InterruptedException {
        String value = Mono.just("hello").block();
        Thread.sleep(10);
        return value;
    }
}
