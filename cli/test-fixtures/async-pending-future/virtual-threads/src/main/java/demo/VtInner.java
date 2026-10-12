package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

// Expected: 0 (N5).
@Component
public class VtInner {
    @Async public CompletableFuture<String> run() { return VtService.Gate.call(); }
}
