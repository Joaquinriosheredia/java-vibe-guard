package com.javavibeguard.blockingkafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import java.util.zip.GZIPOutputStream;

/**
 * One run (one variant, one repetition) per JVM, as PREREGISTRATION.md describes:
 * start the listener container (t0), 20 s warm-up, 120 s window, then one JSON file
 * with every raw event plus the broker's log (gzipped, next to it).
 */
@Component
public class ExperimentRunner implements CommandLineRunner {

    private final KafkaListenerEndpointRegistry registry;
    private final Recorder recorder;

    @Value("${experiment.variant}") String variant;
    @Value("${experiment.block-ms}") long blockMs;
    @Value("${spring.kafka.consumer.max-poll-records}") int maxPollRecords;
    @Value("${spring.kafka.consumer.properties.max.poll.interval.ms}") long maxPollIntervalMs;
    @Value("${spring.kafka.bootstrap-servers}") String bootstrap;
    @Value("${experiment.warmup-seconds:20}") int warmupSeconds;
    @Value("${experiment.window-seconds:120}") int windowSeconds;
    @Value("${experiment.output}") String output;

    public ExperimentRunner(KafkaListenerEndpointRegistry registry, Recorder recorder) {
        this.registry = registry;
        this.recorder = recorder;
    }

    @Override
    public void run(String... args) throws Exception {
        LogCapture.attach(recorder);
        var os = (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
        List<TopicPartition> partitions = new ArrayList<>();
        for (int p = 0; p < Broker.PARTITIONS; p++) {
            partitions.add(new TopicPartition(Listener.TOPIC, p));
        }

        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrap))) {
            Map<TopicPartition, OffsetSpec> latest = new LinkedHashMap<>();
            partitions.forEach(tp -> latest.put(tp, OffsetSpec.latest()));
            long endOffsets = admin.listOffsets(latest).all().get().values().stream().mapToLong(i -> i.offset()).sum();

            MessageListenerContainer container = registry.getListenerContainer(Listener.ID);
            long t0 = System.currentTimeMillis();
            container.start();
            long windowStart = t0 + TimeUnit.SECONDS.toMillis(warmupSeconds);
            long windowEnd = windowStart + TimeUnit.SECONDS.toMillis(windowSeconds);

            // Group state, committed offsets and CPU every 1 s, from t0 to the end of the window.
            List<Map<String, Object>> samples = new ArrayList<>();
            long gcAtWindowStart = -1;
            for (long next = t0; next <= windowEnd; next += 1000) {
                LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(next - System.currentTimeMillis()));
                if (gcAtWindowStart < 0 && next >= windowStart) {
                    gcAtWindowStart = gcMillis();
                }
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("t", System.currentTimeMillis());
                try {
                    s.put("state", admin.describeConsumerGroups(List.of(Listener.ID)).all().get(2, TimeUnit.SECONDS)
                        .get(Listener.ID).state().toString());
                    Map<TopicPartition, OffsetAndMetadata> committed = admin.listConsumerGroupOffsets(Listener.ID)
                        .partitionsToOffsetAndMetadata().get(2, TimeUnit.SECONDS);
                    s.put("committed", committed.values().stream().filter(o -> o != null).mapToLong(OffsetAndMetadata::offset).sum());
                } catch (Exception e) {
                    s.put("error", e.getClass().getSimpleName());
                }
                s.put("cpu", os.getProcessCpuLoad());
                samples.add(s);
            }
            long gcInWindow = gcMillis() - gcAtWindowStart;

            // Client-side cross-check, read before stopping (PREREGISTRATION.md metric 1).
            Map<String, Object> clientMetrics = new LinkedHashMap<>();
            container.metrics().forEach((client, metrics) -> metrics.forEach((name, metric) -> {
                if (name.group().equals("consumer-metrics") && name.name().startsWith("time-between-poll")) {
                    clientMetrics.put(client + "/" + name.name(), metric.metricValue());
                }
            }));
            container.stop();

            Recorder.Snapshot snap = recorder.snapshot();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("variant", variant);
            out.put("block_ms", blockMs);
            out.put("max_poll_records", maxPollRecords);
            out.put("max_poll_interval_ms", maxPollIntervalMs);
            out.put("t0", t0);
            out.put("window_start", windowStart);
            out.put("window_end", windowEnd);
            out.put("end_offsets_sum", endOffsets);
            out.put("gc_ms_in_window", gcInWindow);
            out.put("broker_running_at_end", Broker.container.isRunning());
            out.put("broker_container_id", Broker.container.getContainerId());
            out.put("client_metrics_at_end", clientMetrics);
            out.put("samples", samples);
            out.put("polls", snap.polls());
            out.put("deliveries", snap.deliveries());
            out.put("rebalance_events", snap.rebalances());
            out.put("commits", snap.commits());
            out.put("logs", snap.logs());
            new ObjectMapper().writeValue(new File(output), out);

            try (var gz = new GZIPOutputStream(new FileOutputStream(output.replaceFirst("\\.json$", "") + "-broker.log.gz"))) {
                gz.write(Broker.container.getLogs().getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    private static long gcMillis() {
        return ManagementFactory.getGarbageCollectorMXBeans().stream().mapToLong(GarbageCollectorMXBean::getCollectionTime).sum();
    }
}
