package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

// Expected: 0 (N5).
@Component
public class CeInner {
    @Async public CompletableFuture<String> run() { return Gate.call(); }

    interface Gate { static CompletableFuture<String> call() { return new CompletableFuture<>(); } }
}
