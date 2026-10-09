import com.jcabi.aspects.Async;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;

// @Async from jcabi-aspects, not Spring's: it runs on jcabi's own executor, not the
// Spring @Async executor that verify/blocking measured. Shape from eugenp/tutorials
// libraries-6 JcabiAspectJ.java. Expected: 0 (blocking used to report both calls).
public class BlockingJcabiAsyncFalsePositive {
    @Async
    public static Future<Long> factorialUsingJcabiAspect(int number) {
        Future<Long> factorialFuture = CompletableFuture.supplyAsync(() -> (long) number);
        try {
            Thread.sleep(100);
            return CompletableFuture.completedFuture(factorialFuture.get());
        } catch (Exception e) {
            return CompletableFuture.failedFuture(e);
        }
    }
}
