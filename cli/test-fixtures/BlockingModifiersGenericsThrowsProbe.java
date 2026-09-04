package com.example;

import java.util.concurrent.CompletableFuture;
import org.springframework.scheduling.annotation.Async;

// A3.2 regression fixture — case (c): the method declaration lands several
// lines after the anchor annotation, with modifiers, a generic type
// parameter, and a throws clause in between. findRealOpenBraceIdx() finds
// the real `{` by scanning forward regardless of how many such lines
// intervene — no special-case logic needed for this shape, but it needs
// dedicated coverage to confirm that in practice, not just by inspection.
public class BlockingModifiersGenericsThrowsProbe {
    @Async
    public
    <T> CompletableFuture<T> runJob(T input)
            throws InterruptedException {
        Thread.sleep(300); // BUG: blocking call, method declared several lines after the annotation
        return CompletableFuture.completedFuture(input);
    }
}
