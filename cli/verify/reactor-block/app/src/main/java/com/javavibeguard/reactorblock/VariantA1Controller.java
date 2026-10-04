package com.javavibeguard.reactorblock;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/** A1: .block() in a WebFlux handler, on the event loop. */
@RestController
@Profile("!downstream")
public class VariantA1Controller {

    private final DownstreamClient client;

    public VariantA1Controller(DownstreamClient client) {
        this.client = client;
    }

    @GetMapping("/a1")
    public String a1() {
        Mono<String> response = client.call();
        return response.block();
    }
}
