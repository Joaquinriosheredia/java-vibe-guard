package com.javavibeguard.reactorblock;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.Set;

/**
 * Replication, instrument change 3: records the app's first main-request arrival (F) on the
 * app's own monotonic clock, so the app-side window [F + 10 s, F + 70 s) needs no
 * cross-process clock alignment. Reactive stack only (the replication runs A1, A3 and B).
 */
@Component
@Profile("!downstream")
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.REACTIVE)
public class MainArrivalFilter implements WebFilter {

    static final Set<String> MAIN_PATHS = Set.of("/a1", "/a2", "/a3", "/a4", "/b", "/c");

    private final Sampler sampler;

    public MainArrivalFilter(Sampler sampler) {
        this.sampler = sampler;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        if (MAIN_PATHS.contains(exchange.getRequest().getPath().value())) {
            sampler.mainArrival();
        }
        return chain.filter(exchange);
    }
}
