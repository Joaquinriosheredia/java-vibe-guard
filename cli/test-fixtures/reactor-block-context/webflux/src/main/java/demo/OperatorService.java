package demo;

import java.util.List;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

// reactor-block thread context (2.4.0), in a @Service of a WebFlux module.
// CRITICAL only with evidence of a Reactor thread in this file: a callback of a Reactor
// operator (it runs on the thread that emits the signal), or a fromCallable moved to
// Schedulers.parallel()/single(). Everything else here is WARNING: the thread is unknown.
@Service
public class OperatorService {

    private final Client client;

    public OperatorService(Client client) {
        this.client = client;
    }

    // CRITICAL: expression lambda of map (eugenp FileContentSearchService shape).
    public Flux<String> expressionLambda(Flux<String> names) {
        return names.parallel().runOn(Schedulers.parallel()).map(n -> client.call(n).block()).sequential();
    }

    // CRITICAL: block lambda over several lines, the call nested in an if.
    public Mono<String> blockLambda(Mono<String> source) {
        return source.flatMap(x -> {
            log(x);
            if (x != null) {
                return Mono.just(client.call(x).block());
            }
            return Mono.empty();
        });
    }

    // CRITICAL: nested inside other calls within the lambda.
    public Mono<String> nestedCall(Mono<String> source) {
        return source.map(x -> String.join(",", x, client.call(x).block()));
    }

    // CRITICAL: anonymous class passed to an operator.
    public Mono<String> anonymousOperator(Mono<String> source) {
        return source.map(new Function<String, String>() {
            public String apply(String s) {
                return client.call(s).block();
            }
        });
    }

    // CRITICAL: subscribe consumer.
    public void subscriber(Mono<String> source) {
        source.subscribe(v -> client.call(v).blockLast());
    }

    // CRITICAL: .toFuture().get() inside an operator.
    public Mono<String> futureInOperator(Mono<String> source) {
        return source.map(v -> {
            try {
                return client.call(v).toFuture().get();
            } catch (Exception e) {
                return v;
            }
        });
    }

    // CRITICAL: fromCallable moved to Schedulers.parallel() (variant A2 shape).
    public Mono<String> callableOnParallel() {
        return Mono.fromCallable(() -> client.call("p").block())
                .subscribeOn(Schedulers.parallel());
    }

    // WARNING: a plain statement in a @Service, callers unknown.
    public String statement() {
        return client.call("s").block();
    }

    // WARNING: java.util.stream runs the lambda inline, on this method's (unknown) thread.
    public List<String> streamLambda(List<String> keys) {
        return keys.stream().map(k -> client.call(k).block()).toList();
    }

    // WARNING: a lambda that is not an argument of an operator (DefaultNotificationSender shape).
    public void queued(java.util.Queue<Object> queue) {
        queue.add(new QueueItem("x", () -> client.call("q").block()));
    }

    // WARNING: anonymous class evaluated later by someone else (IndexRouteFactory shape).
    public Object lazy() {
        return new LazyValue() {
            protected Object loadValue() {
                return client.call("l").block();
            }
        };
    }

    // WARNING: fromCallable with no scheduler, outside a handler.
    public Mono<String> callableUnscheduled() {
        return Mono.fromCallable(() -> client.call("u").blockFirst());
    }

    // WARNING: a private helper; its callers are not followed (cross-method analysis is out of scope).
    private String helper() {
        return client.call("h").block();
    }

    private void log(String s) {
    }

    interface Client {
        Flux<String> call(String s);
    }

    record QueueItem(String key, Runnable task) {
    }

    abstract static class LazyValue {
        protected abstract Object loadValue();
    }
}
