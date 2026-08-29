package com.balaaca.app.rest;

import java.util.UUID;
import org.jboss.logging.MDC;

/** Ties a client-visible error to a server log line without revealing anything else. */
public final class TraceId {

    private TraceId() {
    }

    public static String current() {
        Object existing = MDC.get("correlation_id");
        if (existing != null) {
            return existing.toString();
        }
        String generated = UUID.randomUUID().toString();
        MDC.put("correlation_id", generated);
        return generated;
    }
}
