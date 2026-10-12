package demo;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.CompletableFuture;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

// async-returns-pending-future (B0 v1): M1-M8, one per method, each a future that is
// still pending when the @Async method returns it, plus M2 over M8 (approved 2026-10-09).
// Expected: critical 9.
@Service
public class ReportService {
    private final WebClient webClient;                       // M4
    private final HttpClient httpClient;                     // M5
    private final KafkaTemplate<String, String> kafka;       // M6
    private final Listener listener;

    ReportService(WebClient w, HttpClient h, KafkaTemplate<String, String> k, Listener l) {
        webClient = w; httpClient = h; kafka = k; listener = l;
    }

    @Async public CompletableFuture<String> m1() {
        return CompletableFuture.supplyAsync(() -> "x");                       // M1
    }
    @Async public CompletableFuture<Integer> m2() {
        return CompletableFuture.supplyAsync(() -> "x").thenApply(String::length); // M2
    }
    @Async public CompletableFuture<String> m3() {
        return CompletableFuture.completedFuture("x").thenApplyAsync(s -> s + "!"); // M3
    }
    @Async public CompletableFuture<String> m4() {
        return webClient.get().uri("/r")
                .retrieve()
                .bodyToMono(String.class)
                .toFuture();                                                    // M4 (multi-line)
    }
    @Async public CompletableFuture<HttpResponse<String>> m5(HttpRequest req) {
        return httpClient.sendAsync(req, HttpResponse.BodyHandlers.ofString()); // M5
    }
    @Async public CompletableFuture<SendResult<String, String>> m6(String v) {
        var sent = kafka.send("topic", v);                                      // single-assignment local
        return sent;                                                            // M6
    }
    @Async public CompletableFuture<String> m7() {
        CompletableFuture<String> f = new CompletableFuture<>();
        listener.onEvent(f::complete);
        return f;                                                               // M7
    }
    @Async public CompletableFuture<Void> m8() {
        CompletableFuture<String> a = CompletableFuture.supplyAsync(() -> "a");
        return CompletableFuture.allOf(a, CompletableFuture.completedFuture("b")); // M8
    }
    @Async public CompletableFuture<Integer> m2OverM8() {
        CompletableFuture<String> a = CompletableFuture.supplyAsync(() -> "a");
        return CompletableFuture.allOf(a).thenApply(v -> 1);                   // M2 over M8
    }

    interface Listener { void onEvent(java.util.function.Consumer<String> callback); }
}
