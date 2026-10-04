package com.javavibeguard.blockingkafka;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Raw events of one run, all timestamped with epoch milliseconds so they line up with
 * the broker's log. The client id of the consumer thread is set by {@link PollTimingConsumer}
 * on every poll, and the listener runs on that same thread.
 */
@Component
public class Recorder {

    static final ThreadLocal<String> CLIENT = new ThreadLocal<>();

    /** clientId, startMs, endMs, records returned. */
    public record Poll(String client, long start, long end, int records) {}
    /** clientId, startMs, endMs, record id, partition, offset. */
    public record Delivery(String client, long start, long end, int id, int partition, long offset) {}
    /** clientId, timeMs, revoked | assigned | lost, number of partitions. */
    public record Rebalance(String client, long time, String event, int partitions) {}
    /** clientId, timeMs, method, exception class or "ok". Deviation 1: spring-kafka does not log a failed commit. */
    public record Commit(String client, long time, String method, String outcome) {}
    /** timeMs, level, logger, thread, message, cause chain class names. */
    public record LogEvent(long time, String level, String logger, String thread, String message, List<String> causes) {}

    final List<Poll> polls = new ArrayList<>();
    final List<Delivery> deliveries = new ArrayList<>();
    final List<Rebalance> rebalances = new ArrayList<>();
    final List<LogEvent> logs = new ArrayList<>();
    final List<Commit> commits = new ArrayList<>();

    synchronized void poll(String client, long start, long end, int records) {
        polls.add(new Poll(client, start, end, records));
    }

    synchronized void delivery(long start, long end, int id, int partition, long offset) {
        deliveries.add(new Delivery(CLIENT.get(), start, end, id, partition, offset));
    }

    synchronized void rebalance(String client, String event, int partitions) {
        rebalances.add(new Rebalance(client, System.currentTimeMillis(), event, partitions));
    }

    synchronized void commit(String client, String method, String outcome) {
        commits.add(new Commit(client, System.currentTimeMillis(), method, outcome));
    }

    synchronized void log(LogEvent e) {
        logs.add(e);
    }

    synchronized Snapshot snapshot() {
        return new Snapshot(List.copyOf(polls), List.copyOf(deliveries), List.copyOf(rebalances), List.copyOf(logs), List.copyOf(commits));
    }

    record Snapshot(List<Poll> polls, List<Delivery> deliveries, List<Rebalance> rebalances, List<LogEvent> logs, List<Commit> commits) {}
}
