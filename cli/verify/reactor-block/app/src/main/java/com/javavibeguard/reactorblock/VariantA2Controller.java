package com.javavibeguard.reactorblock;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** A2: .block() inside .map() on a Schedulers.parallel() worker (README "Found in the Wild" Finding 2 shape). */
@RestController
@Profile("!downstream")
public class VariantA2Controller {

    private final DownstreamClient client;

    public VariantA2Controller(DownstreamClient client) {
        this.client = client;
    }

    @GetMapping("/a2")
    public Mono<String> a2() {
        return Mono.just(1)
                .subscribeOn(Schedulers.parallel())
                .map(x -> client.call().block());
    }
}
