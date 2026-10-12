package demo;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

// Copied next to a single @Async fixture by contract.test.js (runOnFixture with
// { enableAsync: true }) and scripts/smoke-pack.sh: since 2.3.0, blocking and
// async-returns-pending-future anchor on @Async only when the scanned tree has
// @EnableAsync (without it @Async is inert). Produces no finding of its own.
@Configuration
@EnableAsync
public class EnableAsyncConfig {
}
