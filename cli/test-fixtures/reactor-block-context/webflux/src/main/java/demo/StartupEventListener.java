package demo;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

// reactor-block (2.4.0): @EventListener for ApplicationReadyEvent runs at startup.
// blocking.js anchors on @EventListener independently (its own rule, unchanged).
@Component
public class StartupEventListener {

    // NOT REPORTED by reactor-block: @EventListener(ApplicationReadyEvent.class).
    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        Mono.just("ready").block();
    }

    // NOT REPORTED by reactor-block: the event type as the parameter.
    @EventListener
    public void onReadyParam(ApplicationReadyEvent event) {
        Mono.just("ready").block();
    }
}
