package com.javavibeguard.blockingkafka;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.Map;

/** A fresh single-node broker per run, with the topic and the backlog of PREREGISTRATION.md. */
final class Broker {

    static final String IMAGE = "confluentinc/cp-kafka:7.6.0";
    static final int PARTITIONS = 6;
    static final int BACKLOG = 3000;

    static KafkaContainer container;

    static String start() throws Exception {
        container = new KafkaContainer(DockerImageName.parse(IMAGE));
        container.start();
        String bootstrap = container.getBootstrapServers();
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrap))) {
            admin.createTopics(List.of(new NewTopic(Listener.TOPIC, PARTITIONS, (short) 1))).all().get();
        }
        try (var producer = new KafkaProducer<String, String>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrap,
                ProducerConfig.ACKS_CONFIG, "all"), new StringSerializer(), new StringSerializer())) {
            for (int id = 0; id < BACKLOG; id++) {
                producer.send(new ProducerRecord<>(Listener.TOPIC, id % PARTITIONS, null, Integer.toString(id)));
            }
            producer.flush();
        }
        return bootstrap;
    }
}
