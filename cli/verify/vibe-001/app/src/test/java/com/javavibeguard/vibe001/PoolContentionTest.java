package com.javavibeguard.vibe001;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class PoolContentionTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine");

    @Autowired
    TestRestTemplate restTemplate;

    @Autowired
    DataSource dataSource;

    @Test
    void twentyConcurrentRequests_shouldExhibitPoolContention() throws InterruptedException {
        int concurrency = 20;
        int poolSize = 5;

        // Warm up: single request to initialise schema
        restTemplate.postForEntity("/orders", null, Map.class);

        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch allDone = new CountDownLatch(concurrency);
        ExecutorService executor = Executors.newFixedThreadPool(concurrency);

        List<Long> latencies = new CopyOnWriteArrayList<>();
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger errorCount = new AtomicInteger(0);

        for (int i = 0; i < concurrency; i++) {
            executor.submit(() -> {
                try {
                    startGate.await(); // all threads fire simultaneously
                    long t0 = System.currentTimeMillis();
                    ResponseEntity<Map> resp = restTemplate.postForEntity("/orders", null, Map.class);
                    long latency = System.currentTimeMillis() - t0;
                    latencies.add(latency);
                    if (resp.getStatusCode() == HttpStatus.OK) {
                        successCount.incrementAndGet();
                    } else {
                        errorCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    errorCount.incrementAndGet();
                } finally {
                    allDone.countDown();
                }
            });
        }

        startGate.countDown(); // release all threads at once
        allDone.await(60, TimeUnit.SECONDS);
        executor.shutdown();

        // Analysis
        long minLatency = latencies.stream().mapToLong(Long::longValue).min().orElse(0);
        long maxLatency = latencies.stream().mapToLong(Long::longValue).max().orElse(0);
        long avgLatency = (long) latencies.stream().mapToLong(Long::longValue).average().orElse(0);

        System.out.println("=== VIBE-001 Pool Contention Report ===");
        System.out.println("Concurrency:  " + concurrency + " requests");
        System.out.println("Pool size:    " + poolSize + " connections");
        System.out.println("Successes:    " + successCount.get());
        System.out.println("Errors:       " + errorCount.get());
        System.out.println("Min latency:  " + minLatency + "ms");
        System.out.println("Max latency:  " + maxLatency + "ms");
        System.out.println("Avg latency:  " + avgLatency + "ms");
        System.out.println("Pool stats:   " + getPoolStats());
        System.out.println("=======================================");

        // The key assertions that prove the anti-pattern.
        // Relative thresholds: hardware-independent, safe to run in CI.
        assertThat(successCount.get())
                .as("All requests should eventually succeed (pool queues, not drops)")
                .isEqualTo(concurrency);

        // Pool queuing means late requests wait at least as long as one full batch (pool=5).
        // With 20 requests batched in groups of 5, the slowest must be ≥ 2× the fastest.
        assertThat(maxLatency)
                .as("Max latency must be at least 2× min — proves pool queuing across batches")
                .isGreaterThan(minLatency * 2);

        // The spread captures the queuing penalty: slowest − fastest ≥ one async-sleep duration.
        assertThat(maxLatency - minLatency)
                .as("Spread between fastest and slowest must prove queuing (>800ms)")
                .isGreaterThan(800L);
    }

    private String getPoolStats() {
        if (dataSource instanceof HikariDataSource hds) {
            var pool = hds.getHikariPoolMXBean();
            return "active=" + pool.getActiveConnections()
                    + " idle=" + pool.getIdleConnections()
                    + " waiting=" + pool.getThreadsAwaitingConnection()
                    + " total=" + pool.getTotalConnections();
        }
        return "N/A";
    }
}
