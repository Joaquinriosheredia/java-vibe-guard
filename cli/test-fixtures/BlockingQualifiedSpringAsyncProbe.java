import org.springframework.stereotype.Service;

// Spring's @Async written fully qualified, with no import: still Spring's.
// Expected: blocking critical 1 (the Thread.sleep).
@Service
public class BlockingQualifiedSpringAsyncProbe {
    @org.springframework.scheduling.annotation.Async
    public void process() throws InterruptedException {
        Thread.sleep(100);
    }
}
