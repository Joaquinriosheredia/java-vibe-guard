package com.javavibeguard.blocking;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/** Started/finished task counters. A separate bean: AsyncTasks is a proxy, its fields are not shared. */
@Component
public class Counters {
    final AtomicLong started = new AtomicLong();
    final AtomicLong finished = new AtomicLong();
}
