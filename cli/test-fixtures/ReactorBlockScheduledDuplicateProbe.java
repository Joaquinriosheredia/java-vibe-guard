package com.example;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

// 2.4.0 dedup: blocking.js (@Scheduled anchor) and reactor-block.js both match a
// .block() here. One finding per call, never a lower severity:
//  - refresh(): reactor-block sees no Reactor thread (WARNING); blocking knows the
//    scheduler thread and reports it CRITICAL. Only the blocking finding is kept.
//  - pipeline(): the .block() is inside a Reactor operator callback; reactor-block is
//    CRITICAL and the more specific diagnosis. Only the reactor-block finding is kept.
@Service
public class ReactorBlockScheduledDuplicateProbe {

    private Mono<String> source = Mono.just("x");

    @Scheduled(fixedRate = 1000)
    public void refresh() {
        String v = source.block();
    }

    @Scheduled(fixedRate = 1000)
    public void pipeline() {
        source.map(x -> Mono.just(x).block()).subscribe();
    }
}
