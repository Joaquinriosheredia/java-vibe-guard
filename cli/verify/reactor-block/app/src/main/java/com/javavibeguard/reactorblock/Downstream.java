package com.javavibeguard.reactorblock;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * The slow downstream (profile "downstream", its own JVM and event loops): GET /slow answers
 * after L = 200 ms without holding any thread. Metric 6: arrival and completion time of every
 * /slow request, served at GET /stats at the end of the run.
 */
@RestController
@Profile("downstream")
public class Downstream {

    static final Duration L = Duration.ofMillis(200);
    static final ConcurrentLinkedQueue<long[]> REQUESTS = new ConcurrentLinkedQueue<>();

    @GetMapping("/slow")
    public Mono<String> slow() {
        return Mono.delay(L).map(x -> "ok");
    }

    @GetMapping("/ready")
    public Mono<String> ready() {
        return Mono.just("ready");
    }

    @GetMapping("/stats")
    public List<long[]> stats() {
        return new ArrayList<>(REQUESTS);
    }

    @Component
    @Profile("downstream")
    static class Timing implements WebFilter {
        @Override
        public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
            if (!exchange.getRequest().getPath().value().equals("/slow")) {
                return chain.filter(exchange);
            }
            long arrival = System.currentTimeMillis();
            return chain.filter(exchange)
                    .doOnSuccess(v -> REQUESTS.add(new long[]{arrival, System.currentTimeMillis()}));
        }
    }
}
