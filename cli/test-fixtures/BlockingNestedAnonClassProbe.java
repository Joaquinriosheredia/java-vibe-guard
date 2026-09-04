package com.example;

import org.springframework.context.event.EventListener;

// A3.2 regression fixture — case (d): the method body contains a nested
// anonymous class with its own balanced { ... } pair, and the real blocking
// call comes AFTER that nested block closes. Mirrors a real corpus shape
// (spring-boot-3-grpc/.../HelloWorldClient.java:27-59 — an anonymous
// StreamObserver with three @Override methods of its own, followed by
// Thread.sleep() at line 55). Simple brace-depth counting handles this
// without any special case: the anonymous class's braces just add and remove
// depth like any other nested block, as long as strings/comments are masked
// first (already true — see method-body.js).
public class BlockingNestedAnonClassProbe {
    @EventListener
    public void onStartup(Object event) throws InterruptedException {
        Runnable task = new Runnable() {
            @Override
            public void run() {
                System.out.println("nested anonymous class, own braces");
            }
        };
        task.run();
        Thread.sleep(100); // BUG: blocking call AFTER the nested anonymous class closes its own braces
    }
}
