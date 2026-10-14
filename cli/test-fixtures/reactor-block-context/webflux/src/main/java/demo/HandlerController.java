package demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

// reactor-block thread context (2.4.0): a @RestController of a WebFlux module. Its public
// methods are handlers that run on the Netty event loop (the measured case).
@RestController
public class HandlerController {

    private final Client client;

    public HandlerController(Client client) {
        this.client = client;
    }

    // CRITICAL: plain .block() in a WebFlux handler.
    @GetMapping("/a")
    public String plain() {
        return client.call().block();
    }

    // CRITICAL: .toFuture().get() in a WebFlux handler (the measured deadlock).
    @GetMapping("/b")
    public String future() throws Exception {
        return client.call().toFuture().get();
    }

    // CRITICAL: fromCallable with no subscribeOn, returned from a handler: it runs where
    // the handler's Mono is subscribed, the event loop.
    @GetMapping("/c")
    public Mono<String> callable() {
        return Mono.fromCallable(() -> client.call().block());
    }

    // WARNING: a private helper is not a handler; its callers are not followed.
    private String helper() {
        return client.call().block();
    }

    interface Client {
        Mono<String> call();
    }
}
