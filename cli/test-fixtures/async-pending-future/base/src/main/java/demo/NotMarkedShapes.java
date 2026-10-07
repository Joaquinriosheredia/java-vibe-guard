package demo;

import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

// Shapes that are NOT reported (design §5). Expected: 0 from async-returns-pending-future;
// blocking critical 1 (the join() of n15, a true positive of blocking).
@Service
public class NotMarkedShapes {
    private final Downstream downstream;
    private CompletableFuture<String> cached;
    NotMarkedShapes(Downstream d) { downstream = d; }

    @Async public CompletableFuture<String> n1() {
        return CompletableFuture.completedFuture(load());               // N1 (control K)
    }
    @Async public CompletableFuture<String> n1b() {
        return CompletableFuture.failedFuture(new IllegalStateException()); // N1
    }
    @Async public CompletableFuture<String> n2() {
        CompletableFuture<String> f = new CompletableFuture<>();
        f.complete(load());                                              // completed synchronously
        return f;                                                        // N2
    }
    @Async public CompletableFuture<String> n4(CompletableFuture<String> in) {
        return in;                                                       // N4 (parameter)
    }
    @Async public CompletableFuture<String> n4b() {
        return cached;                                                   // N4 (field)
    }
    @Async public CompletableFuture<Integer> n5() {
        return downstream.call().thenApply(v -> v);                      // N5: the measured shape P
    }
    @Async public CompletableFuture<String> n6() {
        return Mono.just("x").toFuture();                                // N6
    }
    @Async public Future<String> n7() {
        return CompletableFuture.supplyAsync(() -> "x");                 // N7 (Future return type)
    }
    @Async public void n8() { load(); }                                  // N8
    @Async public CompletableFuture<String> n15() {
        CompletableFuture<String> f = CompletableFuture.supplyAsync(() -> "x");
        return CompletableFuture.completedFuture(f.join());              // N15: blocking reports the join()
    }
    @Async public CompletableFuture<Callable<CompletableFuture<String>>> n16() {
        Callable<CompletableFuture<String>> c = () -> {
            return CompletableFuture.supplyAsync(() -> "x");             // N16: the lambda's return
        };
        return CompletableFuture.completedFuture(c);
    }
    @Async public CompletableFuture<String> m7PassedOn() {
        CompletableFuture<String> f = new CompletableFuture<>();
        fill(f);                                                         // may complete it synchronously
        return f;                                                        // not provable → 0
    }
    @Async public CompletableFuture<Integer> m8ThenStage() {
        CompletableFuture<String> a = CompletableFuture.supplyAsync(() -> "a");
        return CompletableFuture.allOf(a).thenApply(v -> 1);             // M2 over M8: not in the approved list → 0
    }
    private String load() { return "x"; }
    private void fill(CompletableFuture<String> f) { f.complete("x"); }

    interface Downstream { CompletableFuture<Integer> call(); }
}
