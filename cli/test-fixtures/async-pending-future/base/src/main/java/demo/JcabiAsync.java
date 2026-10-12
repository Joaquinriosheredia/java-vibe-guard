package demo;

import com.jcabi.aspects.Async;
import java.util.concurrent.CompletableFuture;

// @Async from jcabi-aspects, not Spring's (eugenp/tutorials libraries-6 JcabiAspectJ.java,
// core-java-concurrency-advanced JavaAsync.java). No Spring interceptor. Expected: 0.
public class JcabiAsync {
    @Async public CompletableFuture<Long> factorial(int n) {
        return CompletableFuture.supplyAsync(() -> (long) n);
    }
}
