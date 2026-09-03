package com.balaaca.sharedkernel.error;

import java.util.Map;

/**
 * Base of every business-rule violation in the system. It lives in
 * shared-kernel rather than per context so that one {@code ExceptionMapper} can
 * catch all of them: a per-context base would leave violations from every other
 * context falling through to a raw 500.
 *
 * <p>{@code code} is published and frozen once released; clients branch on it.
 * {@code details} is for the audit log only and is never sent to the client.
 */
public abstract class DomainException extends RuntimeException {

    private final String code;
    private final int status;
    private final transient Map<String, Object> details;

    protected DomainException(String code, int status, String message) {
        this(code, status, message, Map.of(), null);
    }

    protected DomainException(String code, int status, String message, Map<String, Object> details) {
        this(code, status, message, details, null);
    }

    protected DomainException(String code, int status, String message,
                              Map<String, Object> details, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.status = status;
        this.details = Map.copyOf(details);
    }

    public String code() {
        return code;
    }

    public int status() {
        return status;
    }

    /** Structured context for the audit trail. Never serialised to a client. */
    public Map<String, Object> details() {
        return details;
    }
}
