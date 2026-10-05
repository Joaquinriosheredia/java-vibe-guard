import java.io.IOException;
import java.io.PrintWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.LockSupport;

/**
 * Open-model load generator of PREREGISTRATION.md (JDK only, no dependencies).
 *
 * Main traffic at a constant rate λ and two probes at a fixed rate each, all scheduled
 * independently of responses: a scheduler thread per stream computes target times
 * t0 + k / rate and starts one virtual thread per request. Main traffic and probes use two
 * separate HttpClient instances (HTTP/1.1, connect and request timeouts 10 s).
 *
 * Fresh-connection probes (DEVIATIONS.md, 2): the same two endpoints at the same rate, each
 * request through a new HttpClient, so a new TCP connection that the server has to accept.
 * The pre-registered probes reuse keep-alive connections opened before the stall.
 *
 * Writes one JSON file: t0 (epoch ms) and, per request, [kind, target, send, end, outcome,
 * status, class], times in epoch ms. class (replication, instrument change 2) classifies an
 * HTTP 500 by its body: ISE_LOOP, ISE_PARALLEL or OTHER_500; "-" otherwise.
 * Kinds: "m" main, "p" /ping, "q" /ping-parallel, "P" /ping on a
 * fresh connection, "Q" /ping-parallel on a fresh connection. Outcomes:
 * OK, HTTP_500, HTTP_OTHER, TIMEOUT, CONNECT_TIMEOUT, IO_ERROR, UNFINISHED.
 *
 * Usage: LoadGenerator baseUrl mainPath lambda warmupS windowS probeRatePerEndpoint output
 */
public class LoadGenerator {

    static final Duration TIMEOUT = Duration.ofSeconds(10);

    record Result(String kind, double target, double send, double end, String outcome, int status, String cls) {}

    static long t0Nanos;
    static long t0Millis;
    static final ConcurrentLinkedQueue<Result> RESULTS = new ConcurrentLinkedQueue<>();
    static final AtomicInteger IN_FLIGHT = new AtomicInteger();

    static double epochMs(long nanos) {
        return t0Millis + (nanos - t0Nanos) / 1e6;
    }

    public static void main(String[] args) throws Exception {
        String base = args[0];
        String mainPath = args[1];
        double lambda = Double.parseDouble(args[2]);
        double warmup = Double.parseDouble(args[3]);
        double window = Double.parseDouble(args[4]);
        double probeRate = Double.parseDouble(args[5]);
        Path output = Path.of(args[6]);
        double duration = warmup + window;

        HttpClient mainClient = client();
        HttpClient probeClient = client();

        t0Millis = System.currentTimeMillis();
        t0Nanos = System.nanoTime();

        List<Thread> schedulers = new ArrayList<>();
        schedulers.add(scheduler("m", mainClient, URI.create(base + mainPath), lambda, 0, duration));
        schedulers.add(scheduler("p", probeClient, URI.create(base + "/ping"), probeRate, 0, duration));
        // Offset by half a period so the two probes do not fire on the same instant.
        schedulers.add(scheduler("q", probeClient, URI.create(base + "/ping-parallel"), probeRate, 0.5 / probeRate, duration));
        schedulers.add(scheduler("P", null, URI.create(base + "/ping"), probeRate, 0.25 / probeRate, duration));
        schedulers.add(scheduler("Q", null, URI.create(base + "/ping-parallel"), probeRate, 0.75 / probeRate, duration));
        for (Thread s : schedulers) s.join();

        // Every request has a 10 s timeout; wait for them, with a margin.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (IN_FLIGHT.get() > 0 && System.nanoTime() < deadline) {
            Thread.sleep(50);
        }
        write(output, lambda, warmup, window, probeRate, mainPath, IN_FLIGHT.get());
        System.exit(0);
    }

    static HttpClient client() {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(TIMEOUT)
                .build();
    }

    static Thread scheduler(String kind, HttpClient client, URI uri, double rate, double offsetS, double durationS) {
        Thread t = new Thread(() -> {
            for (long k = 0; ; k++) {
                double atS = offsetS + k / rate;
                if (atS >= durationS) break;
                long targetNanos = t0Nanos + (long) (atS * 1e9);
                long wait;
                while ((wait = targetNanos - System.nanoTime()) > 0) {
                    LockSupport.parkNanos(wait);
                }
                IN_FLIGHT.incrementAndGet();
                Thread.startVirtualThread(() -> send(kind, client, uri, targetNanos));
            }
        }, "scheduler-" + kind);
        t.start();
        return t;
    }

    /** A null client means a fresh-connection probe: a new HttpClient, closed afterwards. */
    static void send(String kind, HttpClient shared, URI uri, long targetNanos) {
        HttpClient client = shared != null ? shared : client();
        HttpRequest request = HttpRequest.newBuilder(uri).timeout(TIMEOUT).GET().build();
        long send = System.nanoTime();
        String outcome;
        int status = 0;
        String cls = "-";
        try {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            status = response.statusCode();
            outcome = status == 200 ? "OK" : status == 500 ? "HTTP_500" : "HTTP_OTHER";
            if (status == 500) {
                String body = response.body();
                boolean ise = body.contains("IllegalStateException");
                cls = ise && body.contains("not supported in thread reactor-http-") ? "ISE_LOOP"
                        : ise && body.contains("not supported in thread parallel-") ? "ISE_PARALLEL" : "OTHER_500";
            }
        } catch (HttpConnectTimeoutException e) {
            outcome = "CONNECT_TIMEOUT";
        } catch (HttpTimeoutException e) {
            outcome = "TIMEOUT";
        } catch (IOException e) {
            outcome = "IO_ERROR";
        } catch (InterruptedException e) {
            outcome = "IO_ERROR";
            Thread.currentThread().interrupt();
        }
        long end = System.nanoTime();
        if (shared == null) {
            client.shutdownNow();
        }
        RESULTS.add(new Result(kind, epochMs(targetNanos), epochMs(send), epochMs(end), outcome, status, cls));
        IN_FLIGHT.decrementAndGet();
    }

    static void write(Path output, double lambda, double warmup, double window, double probeRate,
                      String mainPath, int unfinished) throws IOException {
        try (PrintWriter out = new PrintWriter(Files.newBufferedWriter(output))) {
            out.printf(Locale.ROOT, "{\"t0\":%d,\"lambda\":%s,\"warmup_s\":%s,\"window_s\":%s,\"probe_rate\":%s,\"path\":\"%s\",\"unfinished\":%d,\"requests\":[",
                    t0Millis, lambda, warmup, window, probeRate, mainPath, unfinished);
            boolean first = true;
            for (Result r : RESULTS) {
                if (!first) out.print(',');
                first = false;
                out.printf(Locale.ROOT, "[\"%s\",%.3f,%.3f,%.3f,\"%s\",%d,\"%s\"]", r.kind(), r.target(), r.send(), r.end(), r.outcome(), r.status(), r.cls());
            }
            out.println("]}");
        }
    }
}
