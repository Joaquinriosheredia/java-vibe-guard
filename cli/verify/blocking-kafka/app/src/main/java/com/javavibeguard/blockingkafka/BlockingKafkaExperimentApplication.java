package com.javavibeguard.blockingkafka;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BlockingKafkaExperimentApplication {

    public static void main(String[] args) throws Exception {
        String bootstrap = Broker.start();
        SpringApplication app = new SpringApplication(BlockingKafkaExperimentApplication.class);
        app.setDefaultProperties(java.util.Map.of("spring.kafka.bootstrap-servers", bootstrap));
        int exit = SpringApplication.exit(app.run(args));
        Broker.container.stop();
        System.exit(exit);
    }
}
