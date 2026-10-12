package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// spring.threads.virtual.enabled=true in the base configuration: WARNING with the H
// message (verify/async-pending-future (f): no saturation with virtual threads; the
// nested form with virtual threads was not measured). Expected: warning 2.
@Service
public class VtService {
    @Lazy @Autowired private VtService self;
    private final VtInner inner;
    VtService(VtInner i) { inner = i; }

    @Async public CompletableFuture<String> h() { return CompletableFuture.supplyAsync(() -> "x"); } // WARNING (M1)
    @Async public CompletableFuture<String> pn() { return self.run(); }                            // WARNING (M10, H message)
    @Async public CompletableFuture<String> m9() { return inner.run(); }                           // 0 (M9, v2)
    @Async public CompletableFuture<String> run() { return Gate.call(); }                          // 0 (N5)

    static class Gate { static CompletableFuture<String> call() { return new CompletableFuture<>(); } }
}
