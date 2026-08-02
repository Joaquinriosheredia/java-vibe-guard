package com.example;

import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

// BUG: each method below blocks the calling thread the Spring bean runs on.
// Deliberately @Service (not @RestController) with no @GetMapping/etc — so
// this fixture exercises reactor-block only, without also tripping the
// CLI's observability rule (which anchors on @RestController/@Controller +
// an endpoint mapping, neither present here).

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
