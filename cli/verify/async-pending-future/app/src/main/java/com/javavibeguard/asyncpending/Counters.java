package com.javavibeguard.asyncpending;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Shared counters (a separate bean: the @Async beans are proxies). {@code started} counts
 * entries into the method under test (P/P16/V/K/N, or PN's outer method); {@code finished}
 * counts completions of the task the caller observes. For PN, {@code innerStarted} counts
 * entries into the inner @Async method; inner tasks pending in the queue = started (each
 * outer task submits one inner task on entry) - innerStarted. {@code lastKind} is the kind of
 * the last @Async method each thread entered, which labels its stack samples OUTER / INNER.
 */
@Component
public class Counters {
    final AtomicLong started = new AtomicLong();
    final AtomicLong finished = new AtomicLong();
    final AtomicLong innerStarted = new AtomicLong();
    final Map<Thread, String> lastKind = new ConcurrentHashMap<>();
}
