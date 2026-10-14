package demo;

import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

// reactor-block (2.4.0): SmartLifecycle.start runs at startup (halo's
// ExtensionResourceInitializer shape).
@Component
public class StartupLifecycle
        implements SmartLifecycle {

    // NOT REPORTED: SmartLifecycle.start.
    public void start() {
        Mono.just("init").block();
    }

    // WARNING: stop() is not excluded.
    public void stop() {
        Mono.just("bye").block();
    }

    public boolean isRunning() {
        return true;
    }
}
