package com.balaaca.app.rest;

/**
 * RFC 7807. {@code code} is the stable, published value a client branches on;
 * {@code title} is human text that may change. Nothing internal appears here:
 * no stack trace, no SQL, no constraint name, no other tenant's existence.
 */
public record ProblemDetail(String type, String title, int status, String code, String instance) {

    public static ProblemDetail of(String code, int status, String title, String traceId) {
        return new ProblemDetail("https://errors.balaaca.com/" + code.toLowerCase().replace('_', '-'),
                                 title, status, code, traceId);
    }
}
