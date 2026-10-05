package com.javavibeguard.asyncpending;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.LockSupport;

/**
 * One run (one variant, one rate) per JVM, as PREREGISTRATION.md describes: warm-up,
 * window, bounded drain (20 s), one JSON file, then the JVM halts whatever its executor
 * threads are doing (a deadlocked PN run never drains). Every time is System.nanoTime()
 * in this JVM (clock rule).
 */
@Component
public class ExperimentRunner implements CommandLineRunner {

    static final long DRAIN_SECONDS = 20;

    private final PendingTasks tasks;
    private final DirectTasks direct;
    private final Counters counters;
    private final TaskExecutor executor;

    @Value("${experiment.variant}") String variant;
    @Value("${experiment.rate}") double rate;
    @Value("${experiment.warmup-seconds:5}") int warmupSeconds;
    @Value("${experiment.window-seconds:30}") int windowSeconds;
    @Value("${experiment.output}") String output;

    public ExperimentRunner(PendingTasks tasks, DirectTasks direct, Counters counters, TaskExecutor applicationTaskExecutor) {
        this.tasks = tasks;
        this.direct = direct;
        this.counters = counters;
        this.executor = applicationTaskExecutor;
    }

    @Override
    public void run(String... args) throws Exception {
        ThreadPoolTaskExecutor pool = executor instanceof ThreadPoolTaskExecutor p ? p : null;
        AtomicLong submitted = new AtomicLong();
        List<Task> windowTasks = new ArrayList<>();
        List<CompletableFuture<?>> windowFutures = new ArrayList<>();
        long periodNs = (long) (1_000_000_000L / rate);
        long t0 = System.nanoTime();
        long windowStart = t0 + TimeUnit.SECONDS.toNanos(warmupSeconds);
        long windowEnd = windowStart + TimeUnit.SECONDS.toNanos(windowSeconds);

        // Samplers on their own platform thread, never on the @Async executor.
        List<long[]> samples = new ArrayList<>();   // tMs, queue, inFlight, active, poolQueue, finished, innerPending, executorTasks
        List<long[]> stacks = new ArrayList<>();    // tMs, executorThreads, interceptorGet, interceptorGetOuter, interceptorGetInner
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
                long tMs = (now - windowStart) / 1_000_000;
                samples.add(new long[]{tMs, submitted.get() - st, st - fin,
                    pool != null ? pool.getActiveCount() : -1,
                    pool != null ? pool.getThreadPoolExecutor().getQueue().size() : -1,
                    fin, st - counters.innerStarted.get(),
                    pool != null ? pool.getThreadPoolExecutor().getCompletedTaskCount() + pool.getActiveCount() : -1});
                if (tick % 5 == 0) {
                    cpu.add(os.getProcessCpuLoad());
                    if (pool != null) {
                        stacks.add(sampleStacks(tMs));
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
            Task task = new Task(now);
            CompletableFuture<Integer> observed = switch (variant) {
                case "K" -> {
                    CompletableFuture<Integer> done = new CompletableFuture<>();
                    // The task "finishes" (in-flight) when Spring's future completes; end-to-end is `done`.
                    tasks.completed(task, done).whenComplete((v, e) -> counters.finished.incrementAndGet());
                    yield done;
                }
                case "N" -> direct.pending(task);
                case "PN" -> tasks.outer(task);
                default -> tasks.pending(task);   // P, P16, V
            };
            CompletableFuture<Integer> timed = observed.whenComplete((v, e) -> task.endNs = System.nanoTime());
            if (!variant.equals("K")) {
                timed = timed.whenComplete((v, e) -> counters.finished.incrementAndGet());
            }
            submitted.incrementAndGet();
            if (now >= windowStart) {
                windowTasks.add(task);
                windowFutures.add(timed);
            }
            next += periodNs;
        }
        long gcMs = gcTimeMs() - gcStart;
        sampler.join();

        // Bounded drain: a deadlocked run never completes; record what is left.
        boolean drained = true;
        try {
            CompletableFuture.allOf(windowFutures.toArray(CompletableFuture[]::new)).get(DRAIN_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            drained = false;
        }
        List<Task> done = windowTasks.stream().filter(t -> t.endNs != 0).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("variant", variant);
        out.put("rate", rate);
        out.put("warmupSeconds", warmupSeconds);
        out.put("windowSeconds", windowSeconds);
        out.put("executor", executor.getClass().getName());
        out.put("corePoolSize", pool != null ? pool.getCorePoolSize() : null);
        out.put("virtualThreadsProperty", System.getProperty("spring.threads.virtual.enabled"));
        out.put("tasksInWindow", windowTasks.size());
        out.put("drained", drained);
        out.put("unfinished", windowTasks.size() - done.size());
        out.put("queueWaitMs", ms(done.stream().filter(t -> t.startNs != 0).mapToLong(t -> t.startNs - t.submitNs).toArray()));
        out.put("executionMs", ms(done.stream().filter(t -> t.startNs != 0).mapToLong(t -> t.endNs - t.startNs).toArray()));
        out.put("latencyMs", ms(done.stream().mapToLong(t -> t.endNs - t.submitNs).toArray()));
        out.put("processCpuLoad", cpu);
        out.put("gcMsInWindow", gcMs);
        out.put("availableProcessors", Runtime.getRuntime().availableProcessors());
        out.put("samples", Map.of(
            "columns", List.of("tMs", "queue", "inFlight", "poolActive", "poolQueue", "finished", "innerPending", "executorTasks"),
            "rows", samples));
        out.put("stacks", Map.of(
            "columns", List.of("tMs", "executorThreads", "interceptorGet", "interceptorGetOuter", "interceptorGetInner"),
            "rows", stacks));
        new ObjectMapper().writeValue(new File(output), out);
        System.out.println("run written: " + output + " drained=" + drained);
        Runtime.getRuntime().halt(0);
    }

    /** @Async executor threads (Boot's default prefix "task-"), classified at one instant. */
    private long[] sampleStacks(long tMs) {
        long threads = 0, get = 0, outer = 0, inner = 0;
        for (Map.Entry<Thread, StackTraceElement[]> e : Thread.getAllStackTraces().entrySet()) {
            if (!e.getKey().getName().startsWith("task-")) {
                continue;
            }
            threads++;
            if (inInterceptorGet(e.getValue())) {
                get++;
                String kind = counters.lastKind.get(e.getKey());
                if ("OUTER".equals(kind)) outer++;
                if ("INNER".equals(kind)) inner++;
            }
        }
        return new long[]{tMs, threads, get, outer, inner};
    }

    /**
     * INTERCEPTOR_GET (PREREGISTRATION.md, Metrics): a CompletableFuture.get / Future.get frame
     * above (closer to the top than) AsyncExecutionInterceptor.lambda$invoke$0.
     */
    static boolean inInterceptorGet(StackTraceElement[] st) {
        int getAt = -1;
        for (int i = 0; i < st.length; i++) {
            String c = st[i].getClassName(), m = st[i].getMethodName();
            if (getAt < 0 && m.equals("get") && (c.equals("java.util.concurrent.CompletableFuture") || c.equals("java.util.concurrent.Future"))) {
                getAt = i;
            }
            if (c.equals("org.springframework.aop.interceptor.AsyncExecutionInterceptor") && m.equals("lambda$invoke$0")) {
                return getAt >= 0 && getAt < i;
            }
        }
        return false;
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
