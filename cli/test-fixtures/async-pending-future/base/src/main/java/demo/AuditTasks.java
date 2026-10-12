package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

// Callee of OrderService (M9). Its own return is not provably pending from this file
// (N5: the future comes from AuditClient, another file). Expected: 0.
@Component
public class AuditTasks {
    private final AuditClient client;
    AuditTasks(AuditClient client) { this.client = client; }

    @Async public CompletableFuture<Integer> record(OrderService.Order o) {
        return client.send(o);                     // N5 → 0
    }

    interface AuditClient { CompletableFuture<Integer> send(OrderService.Order o); }
}
