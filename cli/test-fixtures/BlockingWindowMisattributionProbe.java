package com.example;

import org.springframework.kafka.annotation.KafkaListener;

// KNOWN LIMITATION — A3.2 (issue #11), NOT fixed by the A3.1 comment-stripping
// commit. Documents, on purpose, that this bug is still open: the
// BLOCKING_PATTERNS window (blocking.js) scans up to 60 lines past an
// annotation and only stops early when it hits ANOTHER annotated line — it
// does not track the annotated method's actual closing brace. A blocking
// call in a later, unrelated, unannotated method within that window is still
// misattributed to the annotation above it.
//
// unrelatedHelper() below is plain code, not a comment — stripComments()
// (A3.1's fix) does nothing for it, and nothing here should make it stop
// firing. The corresponding contract.test.js assertion expects the
// (incorrect) finding to still appear, specifically so a future accidental
// "fix" of this file's expected count doesn't mask A3.2 quietly regressing
// back in, or silently getting "fixed" without anyone noticing. Fixing this
// for real is tracked as A3.2, pending.
public class BlockingWindowMisattributionProbe {
    @KafkaListener(topics = "orders", groupId = "order-group")
    public void consume(String message) {
        System.out.println("processing " + message);
    }

    // A plain helper method, NOT annotated with @KafkaListener — but it falls
    // inside the 60-line window opened by consume() above, and the window
    // scan doesn't stop at method boundaries.
    public void unrelatedHelper() {
        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {}
    }
}
