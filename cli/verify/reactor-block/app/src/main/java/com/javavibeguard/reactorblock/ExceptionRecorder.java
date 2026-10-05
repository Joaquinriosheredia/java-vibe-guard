package com.javavibeguard.reactorblock;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Metric 2: every exception that reaches a handler, on either stack, is recorded with its
 * class, message and the thread it surfaced on, then answered with HTTP 500. The body carries
 * the class and message (replication, instrument change 1), so the generator alone can tell
 * which thread Reactor named.
 */
@RestControllerAdvice
@Profile("!downstream")
public class ExceptionRecorder {

    private final Sampler sampler;

    public ExceptionRecorder(Sampler sampler) {
        this.sampler = sampler;
    }

    @ExceptionHandler(Throwable.class)
    public ResponseEntity<String> handle(Throwable t) {
        sampler.exception(t, Thread.currentThread().getName());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(t.getClass().getName() + ": " + t.getMessage());
    }
}
