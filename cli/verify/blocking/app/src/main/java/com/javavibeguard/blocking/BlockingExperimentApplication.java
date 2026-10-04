package com.javavibeguard.blocking;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class BlockingExperimentApplication {

    public static void main(String[] args) {
        System.exit(SpringApplication.exit(SpringApplication.run(BlockingExperimentApplication.class, args)));
    }
}
