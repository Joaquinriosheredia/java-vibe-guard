package com.javavibeguard.blockingkafka;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.AppenderBase;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * Keeps the client-side log events the criteria need: the consumer's "consumer poll
 * timeout has expired" warning, and every WARN/ERROR with its cause chain (commit
 * failures are counted from it). Attached after Spring Boot has initialised logging.
 */
final class LogCapture extends AppenderBase<ILoggingEvent> {

    private final Recorder recorder;

    private LogCapture(Recorder recorder) {
        this.recorder = recorder;
    }

    static void attach(Recorder recorder) {
        Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        LogCapture appender = new LogCapture(recorder);
        appender.setContext(root.getLoggerContext());
        appender.start();
        root.addAppender(appender);
    }

    @Override
    protected void append(ILoggingEvent e) {
        List<String> causes = new ArrayList<>();
        for (IThrowableProxy t = e.getThrowableProxy(); t != null && causes.size() < 10; t = t.getCause()) {
            causes.add(t.getClassName());
        }
        String msg = e.getFormattedMessage();
        recorder.log(new Recorder.LogEvent(e.getTimeStamp(), e.getLevel().toString(), e.getLoggerName(),
            e.getThreadName(), msg.length() > 400 ? msg.substring(0, 400) : msg, causes));
    }
}
