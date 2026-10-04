package com.javavibeguard.blockingkafka;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.common.TopicPartition;
import org.springframework.boot.autoconfigure.kafka.DefaultKafkaConsumerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ContainerCustomizer;
import org.springframework.kafka.listener.ConcurrentMessageListenerContainer;
import org.springframework.kafka.listener.ConsumerAwareRebalanceListener;

import java.util.Collection;

/** Instrumentation only: poll timing and rebalance events. No consumer setting is changed here. */
@Configuration
public class KafkaConfig {

    @Bean
    DefaultKafkaConsumerFactoryCustomizer pollTiming(Recorder recorder) {
        return factory -> factory.addPostProcessor(c -> PollTimingConsumer.wrap(c, recorder));
    }

    @Bean
    ContainerCustomizer<Object, Object, ConcurrentMessageListenerContainer<Object, Object>> rebalanceEvents(Recorder recorder) {
        return container -> container.getContainerProperties().setConsumerRebalanceListener(new ConsumerAwareRebalanceListener() {
            @Override
            public void onPartitionsRevokedAfterCommit(Consumer<?, ?> consumer, Collection<TopicPartition> partitions) {
                recorder.rebalance(PollTimingConsumer.clientIdOf(consumer), "revoked", partitions.size());
            }

            @Override
            public void onPartitionsAssigned(Consumer<?, ?> consumer, Collection<TopicPartition> partitions) {
                recorder.rebalance(PollTimingConsumer.clientIdOf(consumer), "assigned", partitions.size());
            }

            @Override
            public void onPartitionsLost(Consumer<?, ?> consumer, Collection<TopicPartition> partitions) {
                recorder.rebalance(PollTimingConsumer.clientIdOf(consumer), "lost", partitions.size());
            }
        });
    }
}
