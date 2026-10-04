package demo;

import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

// MVC-only module (pom.xml: spring-boot-starter-web, no WebFlux). verify/reactor-block
// variant C measured that a plain .block() in a RestController of an MVC app holds the
// servlet container's worker, not a Reactor thread. Only that shape is skipped.
@RestController
public class MvcController {

    private final Client client;

    public MvcController(Client client) {
        this.client = client;
    }

    // SKIPPED (variant C shape): plain statement, runs on the servlet worker.
    public String plain() {
        return client.call().block();
    }

    // SKIPPED: the same, split over two statements.
    public String twoStatements() {
        Mono<String> response = client.call();
        return response.block();
    }

    // REPORTED: inside an operator after subscribeOn(parallel()), so it runs on a
    // Reactor worker even in an MVC app (variant A2 shape: fails with an exception).
    public Mono<String> onParallel() {
        return Mono.just(1)
                .subscribeOn(Schedulers.parallel())
                .map(x -> client.call().block());
    }

    // REPORTED: .toFuture().get() was not measured on MVC.
    public String future() throws Exception {
        return client.call().toFuture().get();
    }

    // REPORTED: .blockFirst() was not measured on MVC.
    public String first() {
        return client.many().blockFirst();
    }

    interface Client {
        Mono<String> call();
        reactor.core.publisher.Flux<String> many();
    }
}
