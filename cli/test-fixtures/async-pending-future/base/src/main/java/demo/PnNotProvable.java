package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;

// Calls into other beans (design §6, "No se marca"). In v1 none of them is reported: M9
// is v2, and these are the cases M9 itself would not report either (N9). The design's
// f() (different qualifier) would be H CRITICAL under M9; in v1 it is 0 too.
// Expected: 0.
@Service
public class PnNotProvable {
    private final AuditTasks byNew = new AuditTasks(null);  // created with new → no proxy
    private final Notifier notifier;                        // interface with 2 implementations
    private final ObjectProvider<AuditTasks> provider;
    private final FinalTasks finalTasks;                    // final class
    private final ReportingTasks reporting;                 // @Async("reportExecutor")

    PnNotProvable(Notifier n, ObjectProvider<AuditTasks> p, FinalTasks f, ReportingTasks r) {
        notifier = n; provider = p; finalTasks = f; reporting = r;
    }

    @Async public CompletableFuture<Integer> a() { return byNew.record(null); }
    @Async public CompletableFuture<Integer> b() { return notifier.send("x"); }
    @Async public CompletableFuture<Integer> c() { return provider.getObject().record(null); }
    @Async public CompletableFuture<Integer> d() { return finalTasks.run(); }
    @Async public CompletableFuture<Integer> f() { return reporting.run(); }
}

interface Notifier { CompletableFuture<Integer> send(String s); }
@Component class EmailNotifier implements Notifier { @Async public CompletableFuture<Integer> send(String s) { return Gate.call(); } }
@Component class SmsNotifier implements Notifier { @Async public CompletableFuture<Integer> send(String s) { return Gate.call(); } }
@Component final class FinalTasks { @Async public CompletableFuture<Integer> run() { return Gate.call(); } }
@Component class ReportingTasks { @Async("reportExecutor") public CompletableFuture<Integer> run() { return Gate.call(); } }
class Gate { static CompletableFuture<Integer> call() { return new CompletableFuture<>(); } }
