package com.javavibeguard.reactorblock;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/** C (context control): A1's code, run on MVC (spring.main.web-application-type=servlet), so it blocks a Tomcat worker. */
@RestController
@Profile("!downstream")
public class VariantCController {

    private final DownstreamClient client;

    public VariantCController(DownstreamClient client) {
        this.client = client;
    }

    @GetMapping("/c")
    public String c() {
        Mono<String> response = client.call();
        return response.block();
    }
}
