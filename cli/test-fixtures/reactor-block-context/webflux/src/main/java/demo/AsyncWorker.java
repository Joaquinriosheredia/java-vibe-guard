package demo;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

// reactor-block (2.4.0): Spring's @Async, with @EnableAsync in the scanned tree
// (AsyncConfig.java), runs on the task executor, not on a Reactor thread (halo's
// SessionInvalidationListener shape). blocking.js still reports it (its @Async anchor).
@Service
public class AsyncWorker {

    // NOT REPORTED by reactor-block: @Async with @EnableAsync.
    @Async
    public void invalidate() {
        Mono.just("x").block();
    }
}
