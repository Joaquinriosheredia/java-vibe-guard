package demo;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

// reactor-block thread context (2.4.0): functional handlers and filters, recognised by
// their ServerRequest / ServerWebExchange parameter, run on the event loop.
@Component
public class RouterHandlers {

    private final Client client;

    public RouterHandlers(Client client) {
        this.client = client;
    }

    // CRITICAL: HandlerFunction.
    public Mono<ServerResponse> handle(ServerRequest request) {
        String user = client.call().block();
        return ServerResponse.ok().bodyValue(user);
    }

    // CRITICAL: WebFilter.filter, signature over two lines.
    public Mono<Void> filter(ServerWebExchange exchange,
                             WebFilterChain chain) {
        client.call().block();
        return chain.filter(exchange);
    }

    interface Client {
        Mono<String> call();
    }
}
