package com.javavibeguard.reactorblock;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/** A3: .toFuture().get() in a WebFlux handler, on the event loop. */
@RestController
@Profile("!downstream")
public class VariantA3Controller {

    private final DownstreamClient client;

    public VariantA3Controller(DownstreamClient client) {
        this.client = client;
    }

    @GetMapping("/a3")
    public String a3() throws Exception {
        Mono<String> response = client.call();
        return response.toFuture().get();
    }
}
