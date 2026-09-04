package com.example;

import org.springframework.kafka.annotation.KafkaListener;

// A3.2 (issue #11) — FIXED, was a known limitation. Before A3.2, blocking.js's
// BLOCKING_PATTERNS scan used a fixed 60-line window past an annotation and
// only stopped early when it hit ANOTHER annotated line — it did not track
// the annotated method's actual closing brace. A blocking call in a later,
// unrelated, unannotated method within that window was misattributed to the
// annotation above it. extractMethodBodyRange() (method-body.js) replaced
// the fixed window with the method's real structural boundary, so
// consume()'s scan now correctly stops at its own closing brace and never
// reaches unrelatedHelper() below.
//
// unrelatedHelper() is plain code, not a comment — stripComments() (A3.1's
// fix) never had anything to do with this bug; this fixture exists
// specifically to prove the STRUCTURAL boundary, not the comment-stripping
// fix, is what's under test here. Kept as a permanent regression guard: if
// this assertion ever starts failing again (1 finding instead of 0), the
// structural boundary broke and A3.2 regressed.
public class BlockingWindowMisattributionProbe {
    @KafkaListener(topics = "orders", groupId = "order-group")
    public void consume(String message) {
        System.out.println("processing " + message);
    }

    // A plain helper method, NOT annotated with @KafkaListener, a few lines
    // below consume() — well within what used to be the 60-line window, but
    // outside consume()'s real method body.
    public void unrelatedHelper() {
        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {}
    }
}
