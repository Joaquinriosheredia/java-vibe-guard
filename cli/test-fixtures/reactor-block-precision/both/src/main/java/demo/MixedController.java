package demo;

import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

// Module with both Spring MVC and WebFlux: the web stack cannot be read from the build
// file (a property can switch it), so the plain .block() is still reported.
@RestController
public class MixedController {

    public String plain(Mono<String> source) {
        return source.block();
    }
}
