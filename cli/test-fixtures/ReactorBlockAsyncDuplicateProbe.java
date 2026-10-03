package com.example;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

// 0a (2.0.0) dedup regression fixture: Mono.block() inside an @Async method
// of a Spring bean matches BOTH blocking.js (@Async anchor) and
// reactor-block.js (bean + reactor import) on the same line — the
// java-vibe-guard-demo ReactiveController.java:14 shape. scanner.js keeps only
// reactor-block, so this file must produce exactly ONE finding. The
// Thread.sleep() on another line is a different call and must still be
// reported under blocking (2 findings total).
@Service
public class ReactorBlockAsyncDuplicateProbe {

    @Async
    public String load() throws InterruptedException {
        String value = Mono.just("hello").block();
        Thread.sleep(10);
        return value;
    }
}
