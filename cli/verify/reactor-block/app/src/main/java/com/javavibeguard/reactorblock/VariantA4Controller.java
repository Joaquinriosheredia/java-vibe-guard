package com.javavibeguard.reactorblock;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** A4: .block() wrapped in fromCallable on Schedulers.boundedElastic(), the pattern Reactor's guide allows for blocking. */
@RestController
@Profile("!downstream")
public class VariantA4Controller {

    private final DownstreamClient client;

    public VariantA4Controller(DownstreamClient client) {
        this.client = client;
    }

    @GetMapping("/a4")
    public Mono<String> a4() {
        return Mono.fromCallable(() -> client.call().block())
                .subscribeOn(Schedulers.boundedElastic());
    }
}
