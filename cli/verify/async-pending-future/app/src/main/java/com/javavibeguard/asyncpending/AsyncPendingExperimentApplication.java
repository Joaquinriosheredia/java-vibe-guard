package com.javavibeguard.asyncpending;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class AsyncPendingExperimentApplication {

    public static void main(String[] args) {
        System.exit(SpringApplication.exit(SpringApplication.run(AsyncPendingExperimentApplication.class, args)));
    }
}
