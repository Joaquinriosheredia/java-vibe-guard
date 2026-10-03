package com.javavibeguard.vibe001;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import static java.util.concurrent.TimeUnit.MILLISECONDS;
import static java.util.concurrent.TimeUnit.SECONDS;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

// Skipped in normal mvn test runs (requires -Dvibe.verify=true).
// Invoked by java-vibe-guard --verify VIBE-001 via: mvn test -Dtest=VerifyRunner -Dvibe.verify=true
@EnabledIfSystemProperty(named = "vibe.verify", matches = "true")
@SpringBootTest(webEnvironment = RANDOM_PORT)
@Testcontainers
class VerifyRunner {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withCreateContainerCmdModifier(cmd -> cmd.getHostConfig()
                    .withMemory(512L * 1024 * 1024)
                    .withCpuPeriod(100_000L)
                    .withCpuQuota(100_000L));

    @LocalServerPort int port;
    @Autowired DataSource dataSource;

    @Test
    void runVerification() throws Exception {
        String baseUrl = "http://localhost:" + port;
        RestTemplate client = clientWithTimeout(3);

        // Warm-up: let the pool settle before measuring
        for (int i = 0; i < 3; i++) {
            client.postForEntity(baseUrl + "/orders", null, Map.class);
        }

        int concurrency = 20;
        int maxPool = ((HikariDataSource) dataSource).getMaximumPoolSize();

        AtomicInteger peakActive  = new AtomicInteger(0);
        AtomicInteger peakWaiting = new AtomicInteger(0);
        List<Long> latencies = new CopyOnWriteArrayList<>();

        CountDownLatch gate = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(concurrency);
        ExecutorService exec = Executors.newFixedThreadPool(concurrency);

        // Sample HikariCP pool stats every 50ms during the load window
        ScheduledExecutorService sampler = Executors.newSingleThreadScheduledExecutor();
        sampler.scheduleAtFixedRate(() -> {
            if (dataSource instanceof HikariDataSource hds) {
                var pool = hds.getHikariPoolMXBean();
                peakActive.accumulateAndGet(pool.getActiveConnections(), Math::max);
                peakWaiting.accumulateAndGet(pool.getThreadsAwaitingConnection(), Math::max);
            }
        }, 0, 50, MILLISECONDS);

        for (int i = 0; i < concurrency; i++) {
            exec.submit(() -> {
                try {
                    gate.await();
                    long t0 = System.currentTimeMillis();
                    client.postForEntity(baseUrl + "/orders", null, Map.class);
                    latencies.add(System.currentTimeMillis() - t0);
                } catch (Exception ignored) {
                } finally {
                    done.countDown();
                }
            });
        }

        gate.countDown();
        done.await(15, SECONDS);
        exec.shutdown();
        sampler.shutdown();
        sampler.awaitTermination(1, SECONDS);

        // p95 of collected latencies
        List<Long> sorted = latencies.stream().sorted().collect(Collectors.toList());
        int p95Idx = Math.max(0, (int) Math.ceil(sorted.size() * 0.95) - 1);
        long p95 = sorted.isEmpty() ? 0 : sorted.get(p95Idx);

        double utilization = maxPool > 0 ? (double) peakActive.get() / maxPool * 100.0 : 0.0;

        String json = String.format(
                "{\"poolUtilization\":%.1f,\"waitingRequests\":%d,\"p95LatencyMs\":%d,\"sampledRequests\":%d}",
                utilization, peakWaiting.get(), p95, latencies.size()
        );

        String outputPath = System.getProperty("vibe.output.file", "/tmp/vibe-001-metrics.json");
        Files.writeString(Path.of(outputPath), json);
    }

    private RestTemplate clientWithTimeout(int seconds) {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(seconds * 1000);
        f.setReadTimeout(seconds * 1000);
        return new RestTemplate(f);
    }
}
