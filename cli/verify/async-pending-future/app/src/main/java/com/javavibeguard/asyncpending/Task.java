package com.javavibeguard.asyncpending;

/** Timing of one submitted task, all System.nanoTime() in this JVM (clock rule). */
public final class Task {
    final long submitNs;
    volatile long startNs;   // entry into the method under test (outer method for PN)
    volatile long endNs;     // completion of the future the caller observes
    volatile long taskEndNs; // K only: completion of Spring's future, i.e. the executor task's end (DEVIATIONS.md, 1)

    Task(long submitNs) {
        this.submitNs = submitNs;
    }
}
