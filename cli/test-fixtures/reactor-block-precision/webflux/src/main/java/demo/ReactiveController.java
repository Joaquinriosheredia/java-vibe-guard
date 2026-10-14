package demo;

import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

// WebFlux module. verify/reactor-block variant A4 measured that .block() inside
// Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic()) stalls no Reactor
// thread. Only that shape is skipped.
@RestController
public class ReactiveController {

    private final Client client;

    public ReactiveController(Client client) {
        this.client = client;
    }

    // REPORTED, CRITICAL: plain .block() in a WebFlux handler runs on the event loop.
    public String plain() {
        return client.call().block();
    }

    // SKIPPED (variant A4 shape), on one line.
    public Mono<String> elasticOneLine() {
        return Mono.fromCallable(() -> client.call().block()).subscribeOn(Schedulers.boundedElastic());
    }

    // SKIPPED (variant A4 shape), over several lines.
    public Mono<String> elasticMultiLine() {
        return Mono.fromCallable(() -> client.call().block())
                .subscribeOn(Schedulers.boundedElastic());
    }

    // REPORTED, CRITICAL: subscribeOn(parallel()) runs the callable on a Reactor thread.
    public Mono<String> onParallel() {
        return Mono.fromCallable(() -> client.call().block())
                .subscribeOn(Schedulers.parallel());
    }

    // REPORTED as WARNING (2.4.0): a publishOn keeps it out of the measured A4 shape, so it
    // is not skipped; but the callable runs on boundedElastic (subscribeOn), not on a
    // Reactor event-loop or parallel thread: no evidence of one.
    public Mono<String> withPublishOn() {
        return Mono.fromCallable(() -> client.call().block())
                .subscribeOn(Schedulers.boundedElastic())
                .publishOn(Schedulers.parallel());
    }

    // REPORTED as WARNING (2.4.0): .blockFirst() was not measured on boundedElastic, so it
    // is not skipped; but the callable runs on boundedElastic: no evidence of a Reactor
    // event-loop or parallel thread.
    public Mono<String> elasticBlockFirst() {
        return Mono.fromCallable(() -> client.many().blockFirst())
                .subscribeOn(Schedulers.boundedElastic());
    }

    interface Client {
        Mono<String> call();
        reactor.core.publisher.Flux<String> many();
    }
}
