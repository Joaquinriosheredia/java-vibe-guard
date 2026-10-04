package demo;

import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

// MVC-only module, but a Service: its callers are not known to this file (it may be
// called from a Reactor operator), so the .block() is still reported.
@Service
public class MvcService {

    public String load(Mono<String> source) {
        return source.block();
    }
}
