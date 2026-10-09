package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// M10 (self-injection: the call goes through the proxy) versus N3 (self-invocation: it
// does not). Expected: critical 2 — viaProxy() with the deadlock message (same default
// executor), viaProxyOtherExecutor() with the H message (different executors).
@Service
public class SelfInjectedService {
    @Lazy @Autowired private SelfInjectedService self;
    private final Gateway gateway;
    SelfInjectedService(Gateway g) { gateway = g; }

    @Async public CompletableFuture<Integer> viaProxy() {
        return self.inner();                       // M10 → CRITICAL, deadlock
    }
    @Async public CompletableFuture<Integer> inline() {
        return this.inner();                       // N3 → 0 (no proxy: runs inline)
    }
    @Async public CompletableFuture<Integer> inlineBare() {
        return inner();                            // N3 → 0
    }
    @Async public CompletableFuture<Integer> viaProxyOtherExecutor() {
        return self.onReportExecutor();            // M10, different executor → CRITICAL, H message
    }
    @Async public CompletableFuture<Integer> inner() {
        return gateway.call();                     // N5 → 0
    }
    @Async("reportExecutor") public CompletableFuture<Integer> onReportExecutor() {
        return gateway.call();                     // N5 → 0
    }

    interface Gateway { CompletableFuture<Integer> call(); }
}
