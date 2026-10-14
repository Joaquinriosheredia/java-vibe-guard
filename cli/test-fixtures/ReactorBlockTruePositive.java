package com.example;

import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

// Each method below blocks the calling thread the Spring bean runs on.
// Deliberately @Service (not @RestController) with no @GetMapping/etc — so
// this fixture exercises reactor-block only, without also tripping the
// CLI's observability rule (which anchors on @RestController/@Controller +
// an endpoint mapping, neither present here).
//
// 2.4.0 (Phase 1 (c), decision of 2026-10-14): 4 WARNINGS, no longer CRITICAL. Every
// call is a plain statement of a @Service method: nothing in this file shows that a
// Reactor thread (Netty event loop, Schedulers.parallel()) runs them — no Reactor
// operator callback, no WebFlux handler, no ServerRequest/ServerWebExchange, no
// subscribeOn(parallel()). Who calls these methods is not visible here, so the thread is
// unknown: reported as a warning, never silenced. The "BUG" comments below are kept: the
// calls do block their thread; whether that thread is a Reactor thread is unknown.

@Service
public class ReactorBlockTruePositive {

    private final UserClient userClient;

    public ReactorBlockTruePositive(UserClient userClient) {
        this.userClient = userClient;
    }

    // reactor-block: .block() in a @Service method
    public String getFirstUser() {
        return userClient.findFirst().block(); // BUG: pins thread for full I/O duration
    }

    // reactor-block: .blockFirst() in a @Service method
    public String getFirstItem() {
        Flux<String> items = userClient.findAll();
        return items.blockFirst(); // BUG: same pin, different operator
    }

    // reactor-block: .blockLast() in a @Service method
    public String getLastItem() {
        return userClient.findAll().blockLast(); // BUG
    }

    // reactor-block: .toFuture().get() — reactive chain escaped to blocking Future
    public String getUserSync() throws Exception {
        return userClient.findFirst().toFuture().get(); // BUG: worst pattern — blocks + wraps exception
    }

    interface UserClient {
        Mono<String> findFirst();
        Flux<String> findAll();
    }
}
