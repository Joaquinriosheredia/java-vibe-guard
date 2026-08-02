package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.transaction.annotation.Transactional;
import java.util.concurrent.CompletableFuture;

// Regression fixture for issue #9: this comment mentions @Scheduled,
// @KafkaListener, @Async, @EventListener, @RestController, @Controller,
// and @ControllerAdvice — every annotation name that gates blocking.js,
// kafka.js's checkKafka(), layers.js, observability.js, and
// transactions.js. NONE of those annotations are actually present in this
// file; they are mentioned only in this comment. The real annotations
// below (@GetMapping, @Transactional) exist solely to verify that the
// gates remain closed. Before the fix, each of those five gates
// incorrectly opened from this comment alone; after the fix, none should.
public class CommentMentionGateProbe {

    private final UserRepository userRepository; // real field — would trip
                                                   // layers.js's REPO_FIELD_RE
                                                   // if its gate wrongly opens

    public CommentMentionGateProbe(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/probe") // real mapping — would trip observability.js
                           // if its gate wrongly opens
    public String probe() {
        return "ok";
    }

    @Transactional // real annotation — would trip transactions.js's
                   // Controller-method check if its gate wrongly opens
    public void save() {
    }

    public String blockingCall() throws Exception {
        CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> "x");
        return future.join(); // real blocking call — would trip blocking.js
                               // if its anchor wrongly opens from the comment above
    }

    interface UserRepository {
        Object findAll();
    }
}
