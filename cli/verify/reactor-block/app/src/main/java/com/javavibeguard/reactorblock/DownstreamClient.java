package com.javavibeguard.reactorblock;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

/**
 * The call every variant makes. Built from Boot's WebClient.Builder, so it uses the global
 * reactor-netty resources: the same event loops as the WebFlux server. Nothing blocks here;
 * each variant decides how to wait for the result.
 */
@Component
@Profile("!downstream")
public class DownstreamClient {

    private final WebClient webClient;

    public DownstreamClient(WebClient.Builder builder, @Value("${experiment.downstream-url}") String url) {
        this.webClient = builder.baseUrl(url).build();
    }

    public Mono<String> call() {
        return webClient.get().uri("/slow").retrieve().bodyToMono(String.class);
    }
}
