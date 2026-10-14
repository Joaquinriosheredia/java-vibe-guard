package demo;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

// reactor-block (2.4.0): ApplicationRunner.run runs once at startup, on the main thread.
@Component
public class StartupAppRunner implements ApplicationRunner {

    // NOT REPORTED: ApplicationRunner.run.
    public void run(ApplicationArguments args) {
        Mono.just("seed").block();
    }
}
