package com.example;

import org.springframework.web.bind.annotation.RestController;

// Regression fixture: the second transactions.js matching site left
// unprotected by issues #6 and #9 (see cli/src/rules/transactions.js's
// stripCommentsPreservingLines() comment for the full history). The block
// comment below opens on one line and closes on a later line, without the
// conventional Javadoc " * " prefix on its continuation line — exactly the
// shape neither #6's @Async/ctx fix nor #9's isController-gate fix ever
// reached, since neither touched the @Transactional trigger match itself
// (transactions.js's per-line `if (!/@Transactional\b/.test(...))` check).
// Before this fix, the mention below alone produced a false
// "major: @Transactional on Controller method" finding. Asserted as 0
// findings in cli/test/contract.test.js — same permanent-regression
// pattern as CommentMentionGateProbe.java (issue #9).
@RestController
public class TransactionsBlockCommentGateProbe {

    /* This class used to have @Transactional directly on a handler method —
       moved to the service layer, see ticket JIRA-000. No leading asterisk
       on this continuation line: the conventional " * " Javadoc shape was
       already covered by the trimmed.startsWith('*') skip in
       transactions.js; this fixture exercises the general case that
       heuristic alone does not catch. */
    public String probe() {
        return "ok";
    }
}
