package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// Own executor (AsyncConfigurer): the nested form is reported with the H message, without
// claiming the deadlock (queue and rejection policy not measured). Expected: critical 1.
@Service
public class CeService {
    @Lazy @Autowired private CeService self;
    private final CeInner inner;
    CeService(CeInner i) { inner = i; }

    @Async public CompletableFuture<String> pn() { return self.run(); }     // CRITICAL, H message
    @Async public CompletableFuture<String> m9() { return inner.run(); }    // 0 (M9, v2)
    @Async public CompletableFuture<String> run() { return inner.run(); }   // 0 (M9, v2)
}
