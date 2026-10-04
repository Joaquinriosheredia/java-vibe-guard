package demo;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;

public class ScheduledJob {
    @Scheduled(fixedDelay = 1000)
    public void run() throws InterruptedException {
        Thread.sleep(500); // @Scheduled was not measured: stays CRITICAL
    }

    @Async
    @Scheduled(fixedDelay = 1000)
    public void both() throws InterruptedException {
        Thread.sleep(500); // one anchor not measured: stays CRITICAL
    }

    @KafkaListener(topics = "t", groupId = "g")
    public void listen(String message) throws InterruptedException {
        Thread.sleep(500); // blocking-kafka: unchanged
    }
}
