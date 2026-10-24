#!/usr/bin/env node
/**
 * Regression tests for the false positives of test-corpus-2 (vibe-guard-evaluation
 * `test-corpus-2/FP-ANALYSIS.md`, development data).
 *
 * Each FP fixture is the code of the reviewed finding at its pinned commit, trimmed to
 * what the rule reads, with its review-set ID and repository. Each fix also has a
 * positive control: the pattern the rule exists for is still reported, at the same
 * severity as before.
 *
 * Run: node test/tc2-regressions.test.js
 */
import { checkTransactions, maskCommentsAndLiterals } from '../src/rules/transactions.js';
import { checkBlocking } from '../src/rules/blocking.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

const ctx = (relativePath, text) => ({ filePath: `/virtual/${relativePath}`, relativePath, lines: text.split('\n') });
const transactions = (text) => checkTransactions([ctx('src/main/java/demo/X.java', text)]).filter(f => f.severity === 'critical');
const blocking = (text, extra = []) => checkBlocking([ctx('src/main/java/demo/X.java', text), ...extra]);

// ── transactions: string literals (J003–J013 jdubois/boot-ui, J055 spring-tools) ──────
console.log('\n📋 transactions: annotations named inside string literals are not matched');

// bootui-engine/.../architecture/ArchitectureRules.java:168-171 (J003)
assert(transactions(`
    static final DescribedPredicate<CanBeAnnotated> TRANSACTIONAL_ANNOTATED = annotatedWith(TRANSACTIONAL)
            .or(annotatedWith(JAKARTA_TRANSACTIONAL))
            .as("annotated with @Transactional");

    static final DescribedPredicate<CanBeAnnotated> ASYNC_ANNOTATED =
            annotatedWith(ASYNC).as("annotated with @Async");
`).length === 0, 'J003: .as("annotated with @Transactional") next to .as("annotated with @Async") → 0');

// ArchitectureRules.java:936-944 (J005, J006): a concatenated description
assert(transactions(`
                "ARCH-SPRING-004",
                "Beans should not self-invoke their own proxied methods",
                ArchitectureCategory.SPRING_STEREOTYPES,
                "HIGH",
                "Detects direct self-invocation of methods that are proxied through @Transactional, @Async, or"
                        + " @Cacheable (declared on the method, or @Async/@Cacheable declared on the class), which"
                        + " bypasses the Spring proxy and silently disables the behaviour.",
`).length === 0, 'J005/J006: rule description string → 0');

// ArchitectureRules.java:2170-2187 (J012, J013): ArchCondition text and violation message
assert(transactions(`
        return classes()
                .should(new ArchCondition<JavaClass>("not combine @Async and @Transactional on one method") {
                    @Override
                    public void check(JavaClass javaClass, ConditionEvents events) {
                                events.add(SimpleConditionEvent.violated(
                                        method,
                                        "Method " + method.getFullName()
                                                + " combines @Async and @Transactional; the transaction runs"
                                                + " on the async thread and the caller's context does not"
                                                + " propagate"));
`).length === 0, 'J012/J013: ArchCondition description and violation message → 0');

// spring-boot-language-server/.../Boot3JavaProblemType.java:33-35 (J055)
assert(transactions(`
	MODULITH_TYPE_REF_VIOLATION(ERROR, "Modulith restricted type reference", "Modulith restricted type reference"),
	MODULITH_APPLICATION_MODULE_LISTENER(INFO,
			"Use '@ApplicationModuleListener' instead of '@Async'/'@Transactional'/'@TransactionalEventListener'",
			"Combine into '@ApplicationModuleListener'");
`).length === 0, 'J055: enum description string → 0');

assert(transactions(`
    String doc = """
        @Transactional
        @Async
        """;
    char c = '@';
`).length === 0, 'a text block naming both annotations → 0');

// ── transactions: @interface (J054 spring-projects/spring-modulith) ────────────────────
console.log('\n📋 transactions: a composed annotation (@interface) is not a proxied method');

// spring-modulith-events-api/.../ApplicationModuleListener.java:45-51 (J054)
assert(transactions(`
@Async
@Transactional(propagation = Propagation.REQUIRES_NEW)
@TransactionalEventListener
@Documented
@Target({ ElementType.METHOD, ElementType.ANNOTATION_TYPE })
@Retention(RetentionPolicy.RUNTIME)
public @interface ApplicationModuleListener {
`).length === 0, 'J054: @Async + @Transactional on an @interface → 0');

// ── transactions: positive controls ───────────────────────────────────────────────────
console.log('\n📋 transactions: the real pattern is still CRITICAL, with the reworded message');

// booklore-api/.../hardcover/HardcoverSyncService.java:61-62 (J002, a TP)
const tp = transactions(`
    @Async
    @Transactional(readOnly = true)
    public void syncProgressToHardcover(Long bookId, Float progress, Long userId) {
        String url = "http://host/a?b=\\"@Async\\""; // a "quoted" // comment with @Transactional
    }
`);
assert(tp.length === 1 && tp[0].location === 'src/main/java/demo/X.java:3', 'J002: @Async + @Transactional on a method → 1 CRITICAL at the @Transactional line');
assert(tp.length === 1 && !/will NOT propagate/.test(tp[0].message) && /its own new transaction/.test(tp[0].message),
  'message states its own transaction, not "will NOT propagate"');
assert(transactions(`
/* multi-line comment
   with @Transactional and @Async */
@Async
@Transactional
public void a() {}
`).length === 1 && transactions(`
/* multi-line comment
   with @Transactional and @Async */
@Async
@Transactional
public void a() {}
`)[0].location.endsWith(':5'), 'a multi-line comment above does not shift the reported line');

const masked = maskCommentsAndLiterals('a "x\\n" // c\n/* d\ne */ b \'"\' """\nt\n"""');
assert(masked.split('\n').length === 'a "x\\n" // c\n/* d\ne */ b \'"\' """\nt\n"""'.split('\n').length && !/[xcdet"']/.test(masked) && /a/.test(masked) && /b/.test(masked),
  'maskCommentsAndLiterals keeps code and every newline, blanks comments and literals');

// ── blocking: Quarkus @Scheduled (J015–J018 quarkusio/quarkus) ──────────────────────────
console.log("\n📋 blocking: @Scheduled anchors only when it is Spring's");

// integration-tests/opentelemetry-scheduler/.../FailedBasicScheduler.java (J018)
assert(blocking(`package io.quarkus.it.opentelemetry.scheduler;

import jakarta.enterprise.context.ApplicationScoped;

import io.quarkus.scheduler.Scheduled;

@ApplicationScoped
public class FailedBasicScheduler {

    @Scheduled(cron = "*/1 * * * * ?", identity = "myFailedBasicScheduler")
    void init() throws InterruptedException {
        Thread.sleep(100l);
        throw new RuntimeException("error occurred in myFailedBasicScheduler.");

    }

}`).length === 0, "J018: Quarkus' @Scheduled with Thread.sleep → 0");

const spring = blocking(`import org.springframework.scheduling.annotation.Scheduled;
class Job {
    @Scheduled(fixedDelay = 1000)
    void run() throws InterruptedException {
        Thread.sleep(100);
    }
}`);
assert(spring.length === 1 && spring[0].severity === 'critical', "Spring's @Scheduled (import) → 1 CRITICAL");
const qualified = blocking(`class Job {
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 1000)
    void run() throws InterruptedException {
        Thread.sleep(100);
    }
}`);
assert(qualified.length === 1 && qualified[0].severity === 'critical', "Spring's @Scheduled (fully qualified) → 1 CRITICAL");
assert(blocking(`import org.springframework.scheduling.annotation.*;
class Job {
    @Scheduled(fixedDelay = 1000)
    void run() { future.join(); }
}`).length === 1, "Spring's @Scheduled (wildcard import) → 1");

// ── blocking: start-up @EventListener (J053 spring-petclinic-microservices) ──────────────
console.log('\n📋 blocking: a synchronous @EventListener of a start-up event is WARNING');

// spring-petclinic-genai-service/.../VectorStoreController.java:49-72 (J053)
const startup = blocking(`import org.springframework.boot.context.event.ApplicationStartedEvent;
import org.springframework.context.event.EventListener;

public class VectorStoreController {

	@EventListener
	public void loadVetDataToVectorStoreOnStartup(ApplicationStartedEvent event) throws IOException {
		Resource resource = new ClassPathResource("vectorstore.json");
        String vetsHostname = "http://vets-service/";
        List<Vet> vets = webClient
	            .get()
	            .uri(vetsHostname + "vets")
	            .retrieve()
	            .bodyToMono(new ParameterizedTypeReference<List<Vet>>() {})
	            .block();
	}
}`);
assert(startup.length === 1 && startup[0].severity === 'warning', 'J053: @EventListener(ApplicationStartedEvent) with .block() → 1 WARNING');
assert(startup.length === 1 && /WARNING, not CRITICAL: a synchronous listener of ApplicationStartedEvent/.test(startup[0].message),
  'the message says why');
const annotated = blocking(`class L {
    @EventListener(ApplicationReadyEvent.class)
    public void onReady() { mono.block(); }
}`);
assert(annotated.length === 1 && annotated[0].severity === 'warning', '@EventListener(ApplicationReadyEvent.class) → WARNING');
const runtime = blocking(`class L {
    @EventListener
    public void onOrder(OrderCreatedEvent event) { mono.block(); }
}`);
assert(runtime.length === 1 && runtime[0].severity === 'critical', 'an @EventListener of a runtime event stays CRITICAL');
const stacked = blocking(`import org.springframework.scheduling.annotation.*;
@EnableAsync
class L {
    @Async
    @EventListener
    public void onReady(ApplicationReadyEvent event) { mono.block(); }
}`);
assert(stacked.length === 1 && stacked[0].severity === 'critical', '@Async + @EventListener(start-up) stays CRITICAL: the call runs on the @Async pool');

console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n❌ test-corpus-2 regression tests FAILED.\n');
  process.exit(1);
}
console.log('\n✅ All test-corpus-2 regression tests passed.\n');
