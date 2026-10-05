package com.javavibeguard.reactorblock;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.BufferedWriter;
import java.io.IOException;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadInfo;
import java.lang.management.ThreadMXBean;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.regex.Pattern;

/**
 * Metrics 2, 3 and 7 of PREREGISTRATION.md, written as JSON lines to experiment.output and
 * flushed every tick, so a run whose app has to be killed loses nothing.
 * <ul>
 *   <li>every 500 ms: each thread of the four pools classified BLOCKING_GET / FUTURE_GET /
 *       IDLE / OTHER (first match wins), per-thread CPU time of the event loops, process CPU
 *       time and cumulative GC time;</li>
 *   <li>exceptions recorded by {@link ExceptionRecorder}, drained on the same tick.</li>
 * </ul>
 * It runs on its own platform thread, which no variant can hold.
 */
@Component
@Profile("!downstream")
public class Sampler {

    static final long TICK_MS = 500;
    static final String PACKAGE = "com.javavibeguard.reactorblock.";

    static final Map<String, Pattern> POOLS = new LinkedHashMap<>();
    static {
        POOLS.put("loop", Pattern.compile("reactor-http-.*"));
        POOLS.put("parallel", Pattern.compile("parallel-\\d+"));
        POOLS.put("boundedElastic", Pattern.compile("boundedElastic-\\d+"));
        POOLS.put("tomcat", Pattern.compile("http-nio-\\d+-exec-\\d+"));
    }

    record ExceptionEvent(long t, long nano, String cls, String msg, String thread) {}

    /** Replication, instrument change 3: nanoTime of the first main-request arrival (0 = none yet). */
    private final java.util.concurrent.atomic.AtomicLong firstMainNano = new java.util.concurrent.atomic.AtomicLong();
    private volatile boolean firstMainWritten;

    void mainArrival() {
        firstMainNano.compareAndSet(0, System.nanoTime());
    }

    private final ConcurrentLinkedQueue<ExceptionEvent> exceptions = new ConcurrentLinkedQueue<>();
    private final ObjectMapper json = new ObjectMapper();
    private final Path output;
    private final String web;

    public Sampler(@Value("${experiment.output}") String output,
                   @Value("${spring.main.web-application-type:servlet}") String web) {
        this.output = Path.of(output);
        this.web = web;
    }

    void exception(Throwable t, String thread) {
        exceptions.add(new ExceptionEvent(System.currentTimeMillis(), System.nanoTime(), t.getClass().getName(), String.valueOf(t.getMessage()), thread));
    }

    @PostConstruct
    void start() {
        Thread thread = new Thread(this::loop, "experiment-sampler");
        thread.setDaemon(true);
        thread.start();
    }

    private void loop() {
        ThreadMXBean threads = ManagementFactory.getThreadMXBean();
        var os = (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
        try (BufferedWriter out = Files.newBufferedWriter(output)) {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("type", "meta");
            meta.put("t", System.currentTimeMillis());
            meta.put("cpus", Runtime.getRuntime().availableProcessors());
            meta.put("web", web);
            meta.put("pid", ProcessHandle.current().pid());
            for (String p : new String[]{"reactor.netty.ioWorkerCount", "reactor.schedulers.defaultPoolSize",
                    "reactor.schedulers.defaultBoundedElasticSize", "reactor.schedulers.defaultBoundedElasticQueueSize",
                    "reactor.netty.pool.maxConnections"}) {
                meta.put(p, System.getProperty(p));
            }
            write(out, meta);
            long next = System.currentTimeMillis();
            while (true) {
                long now = System.currentTimeMillis();
                if (now < next) {
                    Thread.sleep(next - now);
                }
                next += TICK_MS;
                write(out, sample(threads, os));
                long first = firstMainNano.get();
                if (first != 0 && !firstMainWritten) {
                    Map<String, Object> f = new LinkedHashMap<>();
                    f.put("type", "first_main");
                    f.put("nano", first);
                    write(out, f);
                    firstMainWritten = true;
                }
                ExceptionEvent e;
                while ((e = exceptions.poll()) != null) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("type", "exception");
                    m.put("t", e.t());
                    m.put("nano", e.nano());
                    m.put("cls", e.cls());
                    m.put("msg", e.msg());
                    m.put("thread", e.thread());
                    write(out, m);
                }
                out.flush();
            }
        } catch (IOException | InterruptedException ex) {
            System.err.println("sampler stopped: " + ex);
        }
    }

    private Map<String, Object> sample(ThreadMXBean threads, com.sun.management.OperatingSystemMXBean os) {
        long t = System.currentTimeMillis();
        long nano = System.nanoTime();
        Map<String, Map<String, Integer>> pools = new LinkedHashMap<>();
        POOLS.keySet().forEach(p -> pools.put(p, new TreeMap<>()));
        Map<String, Long> loopCpu = new TreeMap<>();
        for (ThreadInfo info : threads.dumpAllThreads(false, false)) {
            String pool = poolOf(info.getThreadName());
            if (pool == null) continue;
            pools.get(pool).merge(classify(info), 1, Integer::sum);
            if (pool.equals("loop")) {
                loopCpu.put(info.getThreadName(), threads.getThreadCpuTime(info.getThreadId()));
            }
        }
        long gcMs = 0;
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            gcMs += Math.max(0, gc.getCollectionTime());
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "sample");
        m.put("t", t);
        m.put("nano", nano);
        m.put("pools", pools);
        m.put("loopCpuNs", loopCpu);
        m.put("procCpuNs", os.getProcessCpuTime());
        m.put("gcMs", gcMs);
        return m;
    }

    static String poolOf(String name) {
        for (var e : POOLS.entrySet()) {
            if (e.getValue().matcher(name).matches()) return e.getKey();
        }
        return null;
    }

    /** Metric 3 classification, first match wins. */
    static String classify(ThreadInfo info) {
        StackTraceElement[] st = info.getStackTrace();
        boolean ours = false, blockingGet = false, futureGet = false, waitingForTask = false;
        for (StackTraceElement f : st) {
            String c = f.getClassName(), m = f.getMethodName();
            if (c.startsWith(PACKAGE)) ours = true;
            if (c.equals("reactor.core.publisher.BlockingSingleSubscriber") && m.equals("blockingGet")) blockingGet = true;
            if (c.equals("java.util.concurrent.CompletableFuture") && m.equals("get")) futureGet = true;
            if (m.equals("getTask")) waitingForTask = true;
        }
        if (blockingGet && ours) return "BLOCKING_GET";
        if (futureGet && ours) return "FUTURE_GET";
        if (st.length > 0) {
            String top = st[0].getClassName() + "." + st[0].getMethodName();
            if (top.equals("sun.nio.ch.EPoll.wait") || top.contains("epollWait") || top.contains("SelectorImpl.select")) return "IDLE";
        }
        Thread.State s = info.getThreadState();
        if (waitingForTask && (s == Thread.State.WAITING || s == Thread.State.TIMED_WAITING)) return "IDLE";
        return "OTHER";
    }

    private void write(BufferedWriter out, Map<String, Object> m) throws IOException {
        out.write(json.writeValueAsString(m));
        out.newLine();
    }
}
