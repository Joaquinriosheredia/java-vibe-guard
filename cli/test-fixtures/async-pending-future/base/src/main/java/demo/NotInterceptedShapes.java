package demo;

import java.util.concurrent.CompletableFuture;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// Shapes found in the validate-public corpus (eugenp/tutorials @ ccab8a7) where Spring's
// proxy never calls get() on the returned future. Expected: 0.
@Service
public class NotInterceptedShapes {
    @Async private CompletableFuture<String> privateMethod() {          // the proxy does not intercept it
        return CompletableFuture.supplyAsync(() -> "x");
    }
    @Async public static CompletableFuture<String> staticMethod() {     // nor this one
        return CompletableFuture.supplyAsync(() -> "x");
    }
    @Async public final CompletableFuture<String> finalMethod() {       // CGLIB cannot override it
        return CompletableFuture.supplyAsync(() -> "x");
    }
}
