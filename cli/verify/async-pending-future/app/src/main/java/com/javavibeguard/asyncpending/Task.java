package com.javavibeguard.asyncpending;

/** Timing of one submitted task, all System.nanoTime() in this JVM (clock rule). */
public final class Task {
    final long submitNs;
    volatile long startNs;   // entry into the method under test (outer method for PN)
    volatile long endNs;     // completion of the future the caller observes

    Task(long submitNs) {
        this.submitNs = submitNs;
    }
}
