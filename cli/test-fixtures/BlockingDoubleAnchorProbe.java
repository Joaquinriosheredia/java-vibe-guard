package com.example;

import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;

// A3.2 regression fixture — case (4.b): a single method carries TWO of the
// four shared anchors (@Async + @Scheduled), stacked. Mirrors a real corpus
// shape (spring-scheduling/.../ScheduledFixedRateExample.java:11-15,
// eugenp/tutorials). Each anchor independently opens its own
// extractMethodBodyRange() call and both converge on the SAME real method
// body, so both find the same Thread.sleep().
// 0a (2.0.0): that used to produce TWO findings for ONE call. blocking.js now
// merges findings per (location, rule, call) and names every anchor, so this
// must produce exactly ONE finding:
//   "Thread.sleep() detected in method annotated @Async, @Scheduled"
public class BlockingDoubleAnchorProbe {
    @Async
    @Scheduled(fixedRate = 1000)
    public void scheduleFixedRateTaskAsync() throws InterruptedException {
        Thread.sleep(50); // BUG: single method, two anchors — one call, one finding
    }
}
