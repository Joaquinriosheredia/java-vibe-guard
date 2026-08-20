package com.example;

import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
public class ObservabilityFalsePositive {
    private static final Logger log = LoggerFactory.getLogger(ObservabilityFalsePositive.class);

    @GetMapping("/hello")
    public String hello() {
        log.info("Request received for hello"); // Safe: has structured logging
        return "hello";
    }

    // Safe: URL path variable in the mapping string — the balanced {} from
    // "/{id}" must not be mistaken for the method's own opening/closing
    // brace (real corpus shape: apache-httpclient4/.../BarController.java,
    // spring-petclinic's OwnerController.java, etc.)
    @GetMapping("/items/{id}")
    public String getItem(String id) {
        log.info("Fetching item {}", id);
        return "item-" + id;
    }

    // Safe: multi-line array-literal annotation argument — the { that opens
    // the RequestMethod array must not be mistaken for the method body's
    // opening brace (real corpus shape:
    // spring-boot-modules/.../SpaForwardController.java:9, which opens
    // @RequestMapping(value = { on one line and closes with }) two lines
    // later).
    @RequestMapping(path = "/hello", method = {
        RequestMethod.GET,
        RequestMethod.POST
    })
    public String multiLineMapping() {
        log.info("multi-line mapping hit");
        return "hello";
    }
}
