package com.example;

import org.springframework.kafka.annotation.KafkaListener;

// Regression fixture for issue #11 / A3.1: blocking.js's BLOCKING_PATTERNS
// window scan (blocking.js, inside the per-annotation window loop) matched
// raw lines[i] with no comment stripping — a comment merely mentioning a
// blocking call name inside an otherwise-safe @KafkaListener method body
// produced a false positive. This is the same class of bug as issue #9, but
// at the pattern-match site left explicitly out of scope back then.
//
// Two comment shapes are covered because the window loop's existing
// trimmed.startsWith('//')/('*') skip already caught a comment that IS the
// entire line — it does NOT catch a trailing "// ..." comment after real
// code (consumeJoinMention below), or a single-line "/* ... */" comment not
// prefixed with "*" (consumeSleepMention below). Both reproduced the false
// positive before this fix; both must produce zero findings after it.
public class BlockingWindowCommentProbe {
    @KafkaListener(topics = "orders", groupId = "order-group")
    public void consumeJoinMention(String message) {
        int retries = 0; // avoid future.join() here, it would block the listener thread
        System.out.println("processing " + message + retries);
    }

    @KafkaListener(topics = "payments", groupId = "payment-group")
    public void consumeSleepMention(String message) {
        /* Thread.sleep() must never be used inside a listener method */
        System.out.println("processing " + message);
    }
}
