package com.javavibeguard.blockingkafka;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecords;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

/**
 * Wraps a Kafka consumer so every {@code poll()} call is recorded (start, end, records).
 * T for the criteria = start of a poll − start of the same consumer's previous poll, the
 * definition of the client's own {@code time-between-poll} metric. Also records the outcome
 * of every {@code commitSync()}: spring-kafka 3.1 swallows a failed commit without logging
 * it (DEVIATIONS.md, deviation 1).
 */
final class PollTimingConsumer implements InvocationHandler {

    private final Consumer<?, ?> delegate;
    private final Recorder recorder;
    private volatile String clientId;

    private PollTimingConsumer(Consumer<?, ?> delegate, Recorder recorder) {
        this.delegate = delegate;
        this.recorder = recorder;
    }

    @SuppressWarnings("unchecked")
    static <K, V> Consumer<K, V> wrap(Consumer<K, V> delegate, Recorder recorder) {
        return (Consumer<K, V>) Proxy.newProxyInstance(Consumer.class.getClassLoader(),
            new Class<?>[]{Consumer.class}, new PollTimingConsumer(delegate, recorder));
    }

    static String clientIdOf(Consumer<?, ?> consumer) {
        return consumer.metrics().keySet().stream()
            .map(m -> m.tags().get("client-id")).filter(id -> id != null).findFirst().orElse("?");
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        boolean poll = method.getName().equals("poll");
        boolean commit = method.getName().equals("commitSync");
        if ((poll || commit) && clientId == null) {
            clientId = clientIdOf(delegate);
        }
        long start = System.currentTimeMillis();
        try {
            Object result = method.invoke(delegate, args);
            if (poll) {
                Recorder.CLIENT.set(clientId);
                recorder.poll(clientId, start, System.currentTimeMillis(), ((ConsumerRecords<?, ?>) result).count());
            } else if (commit) {
                recorder.commit(clientId, method.getName(), "ok");
            }
            return result;
        } catch (InvocationTargetException e) {
            if (poll) {
                recorder.poll(clientId, start, System.currentTimeMillis(), -1);
            } else if (commit) {
                recorder.commit(clientId, method.getName(), e.getCause().getClass().getName());
            }
            throw e.getCause();
        }
    }
}
