package demo;

import com.example.annotations.EnableAsync;

// None of these enables Spring's @Async: a comment, a string, and another
// library's annotation with the same simple name.
// @EnableAsync
@EnableAsync
public class NotEnableAsync {
    static final String NOTE = "@EnableAsync";

    /* @org.springframework.scheduling.annotation.EnableAsync */
    void nothing() {
    }
}
