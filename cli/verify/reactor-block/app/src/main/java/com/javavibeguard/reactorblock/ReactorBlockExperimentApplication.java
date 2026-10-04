package com.javavibeguard.reactorblock;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * One jar, two roles. With the "downstream" profile it is the slow downstream (port 8081,
 * its own JVM); otherwise it is the app under test, whose web stack is chosen with
 * spring.main.web-application-type.
 */
@SpringBootApplication
public class ReactorBlockExperimentApplication {

    public static void main(String[] args) {
        SpringApplication.run(ReactorBlockExperimentApplication.class, args);
    }
}
