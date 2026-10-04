package com.javavibeguard.blocking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import java.io.File;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.LockSupport;

/**
 * One experiment run (one variant, one arrival rate) per JVM, as PREREGISTRATION.md
 * describes: warm-up, measurement window, drain, then one JSON file with the raw
 * per-sample series and the per-run metrics.
 */
@Component
public class ExperimentRunner implements CommandLineRunner {

    private final AsyncTasks tasks;
    private final Counters counters;
    private final TaskExecutor executor;

    @Value("${experiment.variant}") String variant;
    @Value("${experiment.rate}") double rate;
    @Value("${experiment.warmup-seconds:5}") int warmupSeconds;
    @Value("${experiment.window-seconds:30}") int windowSeconds;
    @Value("${experiment.output}") String output;

    public ExperimentRunner(AsyncTasks tasks, Counters counters, TaskExecutor applicationTaskExecutor) {
        this.tasks = tasks;
        this.counters = counters;
        this.executor = applicationTaskExecutor;
    }

    @Override
    public void run(String... args) throws Exception {
        ThreadPoolTaskExecutor pool = executor instanceof ThreadPoolTaskExecutor p ? p : null;

        AtomicLong submitted = new AtomicLong();
        List<CompletableFuture<AsyncTasks.TaskTiming>> windowTasks = new ArrayList<>();
        long periodNs = (long) (1_000_000_000L / rate);
        long t0 = System.nanoTime();
        long windowStart = t0 + TimeUnit.SECONDS.toNanos(warmupSeconds);
        long windowEnd = windowStart + TimeUnit.SECONDS.toNanos(windowSeconds);

        // Samplers run on their own platform threads, never on the @Async executor.
        List<long[]> samples = new ArrayList<>();          // t, queue, inFlight, active, poolQueue, completed
        int[] stackCounts = new int[3];                     // executor-thread samples; in join() from blocking(); in Future.get() from the interceptor
        var os = (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
        List<Double> cpu = new ArrayList<>();
        Thread sampler = Thread.ofPlatform().name("sampler").daemon().start(() -> {
            long next = windowStart;
            int tick = 0;
            while (true) {
                LockSupport.parkNanos(next - System.nanoTime());
                long now = System.nanoTime();
                if (now >= windowEnd) {
                    return;
                }
                long st = counters.started.get();
                long fin = counters.finished.get();
                samples.add(new long[]{now - windowStart, submitted.get() - st, st - fin,
                    pool != null ? pool.getActiveCount() : -1,
                    pool != null ? pool.getThreadPoolExecutor().getQueue().size() : -1, fin});
                if (tick % 5 == 0) {
                    cpu.add(os.getProcessCpuLoad());
                    if (pool != null) {
                        sampleStacks(stackCounts);
                    }
                }
                tick++;
                next += TimeUnit.MILLISECONDS.toNanos(100);
            }
        });

        long gcStart = 0;
        boolean gcRead = false;
        long next = t0;
        // Open model: submit on a fixed schedule, whatever the completions do.
        while (true) {
            LockSupport.parkNanos(next - System.nanoTime());
            long now = System.nanoTime();
            if (now >= windowEnd) {
                break;
            }
            if (!gcRead && now >= windowStart) {
                gcStart = gcTimeMs();
                gcRead = true;
            }
            CompletableFuture<AsyncTasks.TaskTiming> f;
            switch (variant) {
                case "B" -> tasks.nonBlocking(now, f = new CompletableFuture<>());
                case "B0" -> f = tasks.returningFuture(now);
                default -> tasks.blocking(now, f = new CompletableFuture<>());
            }
            submitted.incrementAndGet();
            if (now >= windowStart) {
                windowTasks.add(f);
            }
            next += periodNs;
        }
        long gcMs = gcTimeMs() - gcStart;
        sampler.join();
        long completedInWindow = samples.isEmpty() ? 0 : samples.get(samples.size() - 1)[5] - samples.get(0)[5];

        CompletableFuture.allOf(windowTasks.toArray(CompletableFuture[]::new)).get(30, TimeUnit.MINUTES);
        List<AsyncTasks.TaskTiming> timings = windowTasks.stream().map(CompletableFuture::join).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("variant", variant);
        out.put("rate", rate);
        out.put("warmupSeconds", warmupSeconds);
        out.put("windowSeconds", windowSeconds);
        out.put("executor", executor.getClass().getName());
        out.put("corePoolSize", pool != null ? pool.getCorePoolSize() : null);
        out.put("maxPoolSize", pool != null ? pool.getMaxPoolSize() : null);
        out.put("queueCapacity", pool != null ? pool.getQueueCapacity() : null);
        out.put("virtualThreadsProperty", System.getProperty("spring.threads.virtual.enabled"));
        out.put("tasksInWindow", timings.size());
        out.put("completedDuringWindow", completedInWindow);
        out.put("queueWaitMs", ms(timings.stream().mapToLong(t -> t.startNs() - t.submitNs()).toArray()));
        out.put("executionMs", ms(timings.stream().mapToLong(t -> t.endNs() - t.startNs()).toArray()));
        out.put("latencyMs", ms(timings.stream().mapToLong(t -> t.endNs() - t.submitNs()).toArray()));
        out.put("stackSamples", Map.of("executorThreadSamples", stackCounts[0], "inJoin", stackCounts[1],
            "inInterceptorFutureGet", stackCounts[2]));
        out.put("processCpuLoad", cpu);
        out.put("gcMsInWindow", gcMs);
        out.put("availableProcessors", Runtime.getRuntime().availableProcessors());
        out.put("samples", Map.of(
            "columns", List.of("tMs", "queue", "inFlight", "poolActive", "poolQueue", "completed"),
            "rows", samples.stream().map(r -> new long[]{r[0] / 1_000_000, r[1], r[2], r[3], r[4], r[5]}).toList()));
        new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT).writeValue(new File(output), out);
    }

    /** Counts @Async executor threads (Boot's default prefix "task-") and how many are in join(). */
    private static void sampleStacks(int[] counts) {
        for (Map.Entry<Thread, StackTraceElement[]> e : Thread.getAllStackTraces().entrySet()) {
            if (!e.getKey().getName().startsWith("task-")) {
                continue;
            }
            counts[0]++;
            List<StackTraceElement> st = Arrays.asList(e.getValue());
            // Criterion (b), as pre-registered: CompletableFuture.join() called from AsyncTasks.blocking (A, C).
            boolean inJoin = calls(st, "java.util.concurrent.CompletableFuture", "join")
                && calls(st, AsyncTasks.class.getName(), "blocking");
            // Exploratory B0: Future.get() called by Spring's AsyncExecutionInterceptor on the returned future.
            boolean inInterceptorGet = calls(st, "java.util.concurrent.CompletableFuture", "get")
                && calls(st, "org.springframework.aop.interceptor.AsyncExecutionInterceptor", null);
            if (inJoin) {
                counts[1]++;
            }
            if (inInterceptorGet) {
                counts[2]++;
            }
        }
    }

    private static boolean calls(List<StackTraceElement> stack, String className, String method) {
        return stack.stream().anyMatch(f -> f.getClassName().equals(className)
            && (method == null || f.getMethodName().startsWith(method)));
    }

    private static long gcTimeMs() {
        return ManagementFactory.getGarbageCollectorMXBeans().stream()
            .mapToLong(GarbageCollectorMXBean::getCollectionTime).filter(v -> v > 0).sum();
    }

    /** Mean, p50, p95, p99 and max in milliseconds. */
    private static Map<String, Double> ms(long[] ns) {
        long[] s = ns.clone();
        Arrays.sort(s);
        Map<String, Double> m = new LinkedHashMap<>();
        m.put("mean", s.length == 0 ? 0 : Arrays.stream(s).average().orElse(0) / 1e6);
        m.put("p50", pct(s, 0.50));
        m.put("p95", pct(s, 0.95));
        m.put("p99", pct(s, 0.99));
        m.put("max", s.length == 0 ? 0 : s[s.length - 1] / 1e6);
        return m;
    }

    private static double pct(long[] sorted, double p) {
        if (sorted.length == 0) {
            return 0;
        }
        int i = (int) Math.ceil(p * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(i, sorted.length - 1))] / 1e6;
    }
}
