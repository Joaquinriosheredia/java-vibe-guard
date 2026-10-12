package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// One @Async method per rule. Scanned alone (no @EnableAsync anywhere in the tree)
// neither rule reports anything: Spring registers no async interceptor and @Async
// runs inline. Scanned with any file of config/ (and no decoy needed): 1 finding each.
// See contract.test.js, "@EnableAsync in the scanned tree".
@Service
public class AsyncWork {

    @Async
    public void refresh(CompletableFuture<String> pending) {
        pending.join();                                              // blocking .join()
    }

    @Async
    public CompletableFuture<String> report() {
        return CompletableFuture.supplyAsync(() -> "report");        // M1
    }
}
