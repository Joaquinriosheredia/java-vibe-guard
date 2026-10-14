package demo;

import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

// MVC-only module, but a Service: its callers are not known to this file (it may be
// called from a Reactor operator), so the .block() is still reported.
// 2.4.0 (Phase 1 (c), decision of 2026-10-14): as a WARNING, no longer CRITICAL. The
// call is a plain statement: nothing in this file shows that a Reactor thread runs it.
@Service
public class MvcService {

    public String load(Mono<String> source) {
        return source.block();
    }
}
