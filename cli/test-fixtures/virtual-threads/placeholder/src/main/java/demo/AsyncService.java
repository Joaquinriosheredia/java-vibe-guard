package demo;

import org.springframework.scheduling.annotation.Async;
import java.util.concurrent.CompletableFuture;

public class AsyncService {
    @Async
    public void send(CompletableFuture<String> reply) {
        String value = reply.join(); // blocking call inside @Async
        System.out.println(value);
    }
}
