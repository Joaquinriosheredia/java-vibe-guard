package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// M9 (nested form between two beans): NOT detected in v1 — decision 2026-10-06, M9 goes
// to v2 together with N5 (both need cross-file analysis). Expected: 0 (accepted false
// negative; the measured deadlock, verify/async-pending-future (g), is exactly this shape).
@Service
public class OrderService {
    private final AuditTasks audit;
    OrderService(AuditTasks audit) { this.audit = audit; }

    @Async public CompletableFuture<Integer> place(Order o) {
        return audit.record(o);                    // M9 → 0 in v1
    }

    record Order(int id) {}
}
