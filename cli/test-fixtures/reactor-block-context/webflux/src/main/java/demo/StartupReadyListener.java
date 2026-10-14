package demo;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

// reactor-block (2.4.0): ApplicationListener<ApplicationReadyEvent> (halo's
// PluginDevelopmentInitializer shape) runs at startup.
@Component
public class StartupReadyListener implements ApplicationListener<ApplicationReadyEvent> {

    // NOT REPORTED: onApplicationEvent of a ready-event listener.
    public void onApplicationEvent(ApplicationReadyEvent event) {
        Mono.just("ready").block();
    }

    // WARNING: a private helper called from it; its callers are not followed.
    private void createIfNecessary() {
        Mono.just("create").block();
    }
}
