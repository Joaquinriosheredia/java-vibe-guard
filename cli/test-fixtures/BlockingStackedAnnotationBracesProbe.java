package com.example;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import java.io.IOException;
import java.util.concurrent.TimeoutException;

// A3.2 regression fixture — case (b) worst case: a SECOND annotation, stacked
// between the anchor and the method, whose own argument list contains a
// brace-bearing array literal (real Spring Kafka shape: @RetryableTopic's
// include/exclude take Class<? extends Throwable>[]). Before A3.2, blocking.js
// shared observability.js's old maskAnnotationArgs()-style logic that only
// ever masked the FIRST parenthesis group — here that would have been
// @KafkaListener's own args, leaving @RetryableTopic's `{ IOException.class,
// TimeoutException.class }` array literal unmasked, so its `{` could have
// been mistaken for the method body's opening brace. method-body.js's
// findRealOpenBraceIdx() masks ALL parenthesis groups before the real `{`,
// closing this gap. groupId and @RetryableTopic are both present so kafka.js
// (missing-groupId / missing-retry-DLQ) does not fire — this fixture is
// scoped to blocking.js only.
public class BlockingStackedAnnotationBracesProbe {
    @KafkaListener(topics = "orders", groupId = "order-group")
    @RetryableTopic(include = { IOException.class, TimeoutException.class })
    public void consume(String message) throws InterruptedException {
        Thread.sleep(5); // BUG: blocking call inside @KafkaListener, real annotation stacking with braces in the SECOND annotation
    }
}
