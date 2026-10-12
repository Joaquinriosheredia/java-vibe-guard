package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// AspectJ mode: not measured, and self-invocation IS intercepted there. The module is not
// analyzed in v1 (N11). Expected: 0.
@Service
public class AjService {
    @Async public CompletableFuture<String> h() { return CompletableFuture.supplyAsync(() -> "x"); }
}
