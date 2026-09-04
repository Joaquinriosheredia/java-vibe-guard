package com.example;

import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;

// A3.2 regression fixture — case (4.b): a single method carries TWO of the
// four shared anchors (@Async + @Scheduled), stacked. Mirrors a real corpus
// shape (spring-scheduling/.../ScheduledFixedRateExample.java:11-15,
// eugenp/tutorials). Each anchor independently opens its own
// extractMethodBodyRange() call and both converge on the SAME real method
// body, so both correctly find the same Thread.sleep() — this must produce
// TWO findings (same location, different annotationName in the message),
// exactly like today, NOT collapse to one. deduplicate() only collapses on
// location+message, and the message includes the annotation name, so both
// survive.
public class BlockingDoubleAnchorProbe {
    @Async
    @Scheduled(fixedRate = 1000)
    public void scheduleFixedRateTaskAsync() throws InterruptedException {
        Thread.sleep(50); // BUG: single method, two anchors — must produce 2 findings, not 1
    }
}
