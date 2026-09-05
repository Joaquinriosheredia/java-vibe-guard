package com.vibeguard.mcp.rules;

import com.vibeguard.mcp.dto.FileContent;
import com.vibeguard.mcp.dto.Issue;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Detects patterns that cause consumer lag, unnecessary rebalances, and
 * throughput degradation in Spring Kafka listeners.
 *
 * Three signal classes:
 *   WARNING  — @KafkaListener without groupId in annotation:
 *              may be configured via application.yml or env vars; if not,
 *              each restart joins a random consumer group causing rebalances.
 *   CRITICAL — @KafkaListener with groupId explicitly set to "":
 *              empty string is never a valid consumer group, guaranteed rebalance.
 *   CRITICAL — Blocking call inside @KafkaListener method body:
 *              the listener thread stalls, max.poll.interval.ms can expire,
 *              Kafka considers the consumer dead and triggers a rebalance.
 *
 * Gate: detection only activates when @KafkaListener is explicitly present on
 * the method. Class-level or inferred listeners are not covered.
 *
 * Explicit exclusions:
 *   - @Test / @PostConstruct / main() → never flagged
 *   - groupId with a non-empty string value → missing-groupId CRITICAL suppressed
 *   - id with a non-empty value, and idIsGroup not explicitly false → treated as
 *     the effective groupId (framework default: idIsGroup() = true), suppressed
 *   - groupId explicitly "" always wins as CRITICAL, even if id is also present
 *   - Blocking calls outside @KafkaListener methods → not flagged
 *   - Patterns in // line comments, /* *&#47; and /** *&#47; block comments, or
 *     string literals → stripped by stripComments()/blankStrings()
 *
 * groupId detection handles both single-line and multi-line @KafkaListener
 * annotations by accumulating lines until the annotation's parentheses close.
 */
@Component
public class KafkaRebalanceHazardRule implements Rule {

    private static final Pattern KAFKA_LISTENER =
        Pattern.compile("@(?:\\w+\\.)*KafkaListener\\b");

    private static final Pattern EXCLUDED_METHOD_ANNOTATION =
        Pattern.compile("@(?:\\w+\\.)*(?:Test|PostConstruct)\\b");

    private static final Pattern MAIN_METHOD =
        Pattern.compile("public\\s+static\\s+void\\s+main\\s*\\(");

    private static final Pattern METHOD_OPEN = Pattern.compile(
        "(?:public|protected|private)" +
        "(?:\\s+(?:static|final|synchronized|abstract|native))*" +
        "\\s+\\S+\\s+\\w+\\s*\\("
    );

    // groupId must be present and contain at least one character (non-empty string).
    // Applied to the raw annotation text (string values preserved, comments stripped).
    private static final Pattern GROUP_ID_VALID =
        Pattern.compile("groupId\\s*=\\s*\"[^\"]+\"");

    // groupId explicitly set to empty string "" — always CRITICAL (invalid group name).
    private static final Pattern GROUP_ID_EXPLICIT_EMPTY =
        Pattern.compile("groupId\\s*=\\s*\"\"");

    // id() with a non-empty value. Per the framework's own Javadoc
    // (KafkaListener.idIsGroup(), default true): "When groupId is not provided,
    // use the id (if provided) as the group.id property... Set to false, to use
    // the group.id from the consumer factory." So an explicit id acts as the
    // effective groupId unless idIsGroup = false overrides that.
    private static final Pattern ID_VALID =
        Pattern.compile("\\bid\\s*=\\s*\"[^\"]+\"");

    // idIsGroup explicitly disabled — id must NOT be treated as the effective groupId.
    private static final Pattern ID_IS_GROUP_FALSE =
        Pattern.compile("idIsGroup\\s*=\\s*false\\b");

    // Blocking calls that stall the listener thread beyond max.poll.interval.ms.
    // Same detection surface as ConnectionPoolStarvationRule — any call that blocks
    // the calling thread for an unpredictable duration is a rebalance risk here.
    private static final Pattern BLOCKING_CALL = Pattern.compile(
        "\\bThread\\.sleep\\s*\\(" +
        "|\\b\\w*[Ff]uture\\w*\\s*\\.\\s*get\\s*\\(" +
        "|\\b\\w*[Rr]est[Tt]emplate\\w*\\s*\\.\\s*\\w+\\s*\\(" +
        "|\\.\\s*block\\s*\\(" +
        "|\\bFiles\\.(?:readAllBytes|readAllLines|readString|lines)\\s*\\(" +
        "|\\binputStream\\s*\\.\\s*read\\w*\\s*\\(" +
        "|\\b(?:statement|pstmt|stmt|preparedStatement)\\s*\\.\\s*execute\\w*\\s*\\("
    );

    @Override
    public String id() { return "VIBE-006"; }

    @Override
    public String description() {
        return "Kafka rebalance hazard: missing groupId or blocking call inside @KafkaListener";
    }

    @Override
    public List<Issue> analyze(FileContent file) {
        if (!file.path().endsWith(".java")) return List.of();

        List<Issue> issues = new ArrayList<>();
        List<String> lines = file.lines();

        int     braceDepth      = 0;
        boolean inBlockComment  = false;

        // Annotation accumulation state (outside methods)
        boolean       pendingExcluded           = false;
        boolean       pendingKafkaListener      = false;
        boolean       pendingGroupIdValid        = false;
        boolean       pendingGroupIdExplicitEmpty = false;
        int           kafkaParenDepth            = 0;
        StringBuilder kafkaAnnotBuf              = null;

        // Method state
        boolean inMethod                    = false;
        boolean inExcludedMethod            = false;
        boolean inKafkaListenerMethod       = false;
        boolean listenerGroupIdValid        = false;
        boolean listenerGroupIdExplicitEmpty = false;
        boolean emittedGroupIdIssue         = false;
        int     methodDepth                 = -1;
        int     methodLine                  = -1;

        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            String trim = line.strip();
            // raw: // and /* */ comments stripped, string values kept — used for groupId detection.
            // Block-comment state carries across lines via inBlockComment.
            StrippedLine stripped = stripComments(trim, inBlockComment);
            inBlockComment = stripped.inBlockComment();
            String raw     = stripped.text();
            // code: comments + string contents stripped — used for pattern detection
            String code = blankStrings(raw);

            // --- Annotation tracking (outside method bodies) ---
            if (!inMethod) {
                if (EXCLUDED_METHOD_ANNOTATION.matcher(code).find()) pendingExcluded = true;

                if (KAFKA_LISTENER.matcher(code).find()) {
                    // Start accumulating @KafkaListener annotation text
                    pendingKafkaListener = true;
                    kafkaAnnotBuf        = new StringBuilder(raw);
                    kafkaParenDepth      = 0;
                    for (char c : raw.toCharArray()) {
                        if (c == '(')                        kafkaParenDepth++;
                        else if (c == ')' && kafkaParenDepth > 0) kafkaParenDepth--;
                    }
                    if (kafkaParenDepth == 0) {
                        // Single-line or no-paren annotation — accumulation complete
                        pendingGroupIdValid         = isGroupIdEffectivelyValid(kafkaAnnotBuf);
                        pendingGroupIdExplicitEmpty = !pendingGroupIdValid
                            && GROUP_ID_EXPLICIT_EMPTY.matcher(kafkaAnnotBuf).find();
                    }
                } else if (pendingKafkaListener && kafkaParenDepth > 0) {
                    // Continuation line of a multi-line @KafkaListener(...) annotation
                    kafkaAnnotBuf.append(' ').append(raw);
                    for (char c : raw.toCharArray()) {
                        if (c == '(')                        kafkaParenDepth++;
                        else if (c == ')' && kafkaParenDepth > 0) kafkaParenDepth--;
                    }
                    if (kafkaParenDepth == 0) {
                        pendingGroupIdValid         = isGroupIdEffectivelyValid(kafkaAnnotBuf);
                        pendingGroupIdExplicitEmpty = !pendingGroupIdValid
                            && GROUP_ID_EXPLICIT_EMPTY.matcher(kafkaAnnotBuf).find();
                    }
                }
            }

            // --- Method entry ---
            if (!inMethod && METHOD_OPEN.matcher(code).find()) {
                boolean isAbstract = !code.contains("{") && code.endsWith(";");
                if (!isAbstract) {
                    inMethod                     = true;
                    inExcludedMethod             = pendingExcluded || MAIN_METHOD.matcher(code).find();
                    inKafkaListenerMethod        = pendingKafkaListener;
                    listenerGroupIdValid         = pendingGroupIdValid;
                    listenerGroupIdExplicitEmpty = pendingGroupIdExplicitEmpty;
                    emittedGroupIdIssue          = false;
                    methodDepth                  = braceDepth;
                    methodLine                   = i + 1;
                }
                pendingExcluded           = false;
                pendingKafkaListener      = false;
                pendingGroupIdValid        = false;
                pendingGroupIdExplicitEmpty = false;
                kafkaAnnotBuf             = null;
                kafkaParenDepth           = 0;
            }

            // --- Brace counting ---
            for (char c : line.toCharArray()) {
                if (c == '{') braceDepth++;
                else if (c == '}') braceDepth--;
            }

            // --- Exit: method ---
            if (inMethod && braceDepth <= methodDepth && trim.contains("}")) {
                inMethod                     = false;
                inExcludedMethod             = false;
                inKafkaListenerMethod        = false;
                listenerGroupIdValid         = false;
                listenerGroupIdExplicitEmpty = false;
                emittedGroupIdIssue          = false;
                methodDepth                  = -1;
                methodLine                   = -1;
            }

            // Only scan inside active, non-excluded @KafkaListener methods
            if (!inMethod || inExcludedMethod || !inKafkaListenerMethod) continue;

            // --- CRITICAL/WARNING: missing or empty groupId ---
            // Emitted once per method on the method declaration line so the developer
            // sees the annotation that needs to be fixed, not a line inside the body.
            if (!listenerGroupIdValid && !emittedGroupIdIssue) {
                if (listenerGroupIdExplicitEmpty) {
                    issues.add(new Issue(id(), "CRITICAL", file.path(), methodLine,
                        "Kafka rebalance hazard: @KafkaListener without explicit groupId — " +
                        "each restart joins a new random consumer group, causing rebalances " +
                        "and potential duplicate or lost message processing; " +
                        "add groupId = \"your-consumer-group\""
                    ));
                } else {
                    issues.add(new Issue(id(), "WARNING", file.path(), methodLine,
                        "groupId not found in @KafkaListener annotation. " +
                        "Verify it is configured via application.yml, " +
                        "application-*.yml or environment variables. " +
                        "If not configured elsewhere, consumer reprocessing " +
                        "may occur after restarts."
                    ));
                }
                emittedGroupIdIssue = true;
            }

            // --- CRITICAL: blocking call inside listener ---
            if (BLOCKING_CALL.matcher(code).find()) {
                issues.add(new Issue(id(), "CRITICAL", file.path(), i + 1,
                    "Kafka rebalance hazard: blocking call inside @KafkaListener delays " +
                    "acknowledgement and can exceed max.poll.interval.ms, triggering a " +
                    "rebalance — offload to an async executor or use non-blocking I/O"
                ));
            }
        }

        return issues;
    }

    /**
     * Whether the accumulated @KafkaListener annotation text has an effective groupId.
     * Framework rule (KafkaListener.idIsGroup(), default true): an explicit id() acts
     * as the effective groupId unless idIsGroup = false is set. An explicit empty
     * groupId = "" always wins as invalid, regardless of id.
     */
    private static boolean isGroupIdEffectivelyValid(CharSequence annotationText) {
        if (GROUP_ID_EXPLICIT_EMPTY.matcher(annotationText).find()) return false;
        if (GROUP_ID_VALID.matcher(annotationText).find())          return true;
        return ID_VALID.matcher(annotationText).find()
            && !ID_IS_GROUP_FALSE.matcher(annotationText).find();
    }

    /**
     * Result of stripping comments from one line: {@code text} is the line with //
     * and block comments removed (string literal contents preserved), and
     * {@code inBlockComment} is the carry-over state for the next line.
     */
    private record StrippedLine(String text, boolean inBlockComment) {}

    /**
     * Character-by-character state machine that strips // line comments and /* *&#47;
     * (including /** *&#47; Javadoc) block comments, respecting string literal
     * boundaries so a comment marker inside a string is never mistaken for a real
     * comment. Block-comment state carries across lines via the returned
     * {@code inBlockComment} flag, which callers thread back in on the next line.
     * Does not touch the caller's {@code line}/{@code trim} — those stay untouched
     * for braceDepth counting.
     */
    private static StrippedLine stripComments(String trimmedLine, boolean startedInBlockComment) {
        StringBuilder out = new StringBuilder(trimmedLine.length());
        boolean inBlockComment = startedInBlockComment;
        boolean inString       = false;
        int n = trimmedLine.length();
        int i = 0;
        while (i < n) {
            char c = trimmedLine.charAt(i);

            if (inBlockComment) {
                if (c == '*' && i + 1 < n && trimmedLine.charAt(i + 1) == '/') {
                    inBlockComment = false;
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            if (inString) {
                out.append(c);
                if (c == '\\' && i + 1 < n) {
                    // Keep escape sequences intact so a "\"" doesn't end the string early.
                    out.append(trimmedLine.charAt(i + 1));
                    i += 2;
                    continue;
                }
                if (c == '"') inString = false;
                i++;
                continue;
            }

            if (c == '/' && i + 1 < n && trimmedLine.charAt(i + 1) == '/') {
                break; // line comment — rest of the line is discarded
            }
            if (c == '/' && i + 1 < n && trimmedLine.charAt(i + 1) == '*') {
                inBlockComment = true;
                i += 2;
                continue;
            }
            if (c == '"') inString = true;
            out.append(c);
            i++;
        }
        return new StrippedLine(out.toString(), inBlockComment);
    }

    /** Blanks string literal contents (for blocking-call/annotation pattern matching). */
    private static String blankStrings(String text) {
        return text.replaceAll("\"[^\"]*\"", "\"\"");
    }
}
