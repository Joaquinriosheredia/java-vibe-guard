package demo;

import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

// reactor-block (2.4.0): ApplicationListener<ContextRefreshedEvent> runs on context refresh.
@Component
public class StartupRefreshedListener implements ApplicationListener<ContextRefreshedEvent> {

    // NOT REPORTED: onApplicationEvent of a context-refreshed listener.
    public void onApplicationEvent(ContextRefreshedEvent event) {
        Mono.just("refreshed").block();
    }
}
