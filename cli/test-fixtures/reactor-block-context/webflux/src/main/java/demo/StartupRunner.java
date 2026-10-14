package demo;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

// reactor-block (2.4.0): CommandLineRunner.run runs once at startup, on the main thread.
@Component
public class StartupRunner implements CommandLineRunner {

    // NOT REPORTED: CommandLineRunner.run.
    public void run(String... args) {
        Mono.just("seed").block();
    }

    // WARNING: another method of the same bean, thread unknown.
    public String other() {
        return Mono.just("x").block();
    }
}
