package com.example.publishing.logging;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.MDC;

/**
 * Stamps a fixed set of correlation fields into MDC for the duration of one
 * log line, then removes them — Spring Boot's structured JSON logging
 * (application.yml) includes every MDC key as a top-level field, which is
 * what makes these fields exact-match {@code structured-field} evidence
 * instead of plain substring text (docs/architecture.md §5).
 */
public final class StructuredLog {

    private StructuredLog() {
    }

    public static Fields fields() {
        return new Fields();
    }

    public static final class Fields {
        private final Map<String, String> values = new LinkedHashMap<>();

        public Fields with(String key, String value) {
            values.put(key, value == null ? "" : value);
            return this;
        }

        public void info(Logger log, String message) {
            values.forEach(MDC::put);
            try {
                log.info(message);
            } finally {
                values.keySet().forEach(MDC::remove);
            }
        }

        public void warn(Logger log, String message) {
            values.forEach(MDC::put);
            try {
                log.warn(message);
            } finally {
                values.keySet().forEach(MDC::remove);
            }
        }
    }
}
