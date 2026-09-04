package com.example;

import org.springframework.scheduling.annotation.Scheduled;

// A3.2 regression fixture — case (a): the anchor annotation's own argument
// list is split across multiple lines. Mirrors a real corpus shape
// (spring-kafka-2/.../ConsumerSimulator.java:9-11 — @KafkaListener with args
// split across 3 lines), applied here to @Scheduled to get dedicated
// coverage on a second of the four anchors. The blocking call is real code
// inside the method's real body, several lines after the annotation closes.
public class BlockingMultiLineAnnotationProbe {
    @Scheduled(
        cron = "0 0 1 * * ?",
        zone = "Europe/Madrid"
    )
    public void removeStaleSessions() throws InterruptedException {
        Thread.sleep(200); // BUG: blocking call inside @Scheduled, multi-line annotation args
    }
}
