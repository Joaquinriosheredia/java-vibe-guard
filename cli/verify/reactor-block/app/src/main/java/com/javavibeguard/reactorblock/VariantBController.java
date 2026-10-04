package com.javavibeguard.reactorblock;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/** B (control): the same call, composed without blocking. */
@RestController
@Profile("!downstream")
public class VariantBController {

    private final DownstreamClient client;

    public VariantBController(DownstreamClient client) {
        this.client = client;
    }

    @GetMapping("/b")
    public Mono<String> b() {
        return client.call();
    }
}
