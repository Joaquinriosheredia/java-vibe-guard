package com.javavibeguard.reactorblock;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** Probes that block nothing: if they stall, the scheduler is stalled, not just the blocking request. */
@RestController
@Profile("!downstream")
public class ProbeController {

    @GetMapping("/ping")
    public Mono<String> ping() {
        return Mono.just("pong");
    }

    @GetMapping("/ping-parallel")
    public Mono<String> pingParallel() {
        return Mono.fromCallable(() -> "pong").subscribeOn(Schedulers.parallel());
    }
}
