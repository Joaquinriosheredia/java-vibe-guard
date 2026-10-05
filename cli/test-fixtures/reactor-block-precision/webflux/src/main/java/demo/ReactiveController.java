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

    // REPORTED: plain .block() in a WebFlux handler runs on the event loop.
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

    // REPORTED: subscribeOn(parallel()) is not boundedElastic.
    public Mono<String> onParallel() {
        return Mono.fromCallable(() -> client.call().block())
                .subscribeOn(Schedulers.parallel());
    }

    // REPORTED: a publishOn can move the work off boundedElastic.
    public Mono<String> withPublishOn() {
        return Mono.fromCallable(() -> client.call().block())
                .subscribeOn(Schedulers.boundedElastic())
                .publishOn(Schedulers.parallel());
    }

    // REPORTED: .blockFirst() was not measured on boundedElastic.
    public Mono<String> elasticBlockFirst() {
        return Mono.fromCallable(() -> client.many().blockFirst())
                .subscribeOn(Schedulers.boundedElastic());
    }

    interface Client {
        Mono<String> call();
        reactor.core.publisher.Flux<String> many();
    }
}
