package com.javavibeguard.blockingkafka;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * The pattern the rule detects: a blocking {@code .join()} inside a {@code @KafkaListener}.
 * Identical in every variant; only b, max.poll.records and max.poll.interval.ms change.
 */
@Component
public class Listener {

    static final String ID = "bk";
    static final String TOPIC = "bk-in";

    private final Downstream downstream;
    private final Recorder recorder;

    @Value("${experiment.block-ms}") long blockMs;

    public Listener(Downstream downstream, Recorder recorder) {
        this.downstream = downstream;
        this.recorder = recorder;
    }

    @KafkaListener(id = ID, topics = TOPIC, concurrency = "2", clientIdPrefix = ID, autoStartup = "false")
    public void onRecord(ConsumerRecord<String, String> rec) {
        long start = System.currentTimeMillis();
        downstream.call(blockMs).join();
        recorder.delivery(start, System.currentTimeMillis(), Integer.parseInt(rec.value()), rec.partition(), rec.offset());
    }
}
