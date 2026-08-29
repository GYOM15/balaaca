package com.balaaca.app.rest;

import com.balaaca.sharedkernel.error.DomainException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;
import org.jboss.logging.MDC;

/**
 * The single place an exception becomes a response. Resources never build error
 * bodies, so there is exactly one file to read to know what a client can see.
 *
 * <p>The exception's own {@code details} are logged, never serialised: they hold
 * the audit context - which staff member was busy, which subject failed to
 * resolve - that the client must not learn.
 */
@Provider
public class DomainExceptionMapper implements ExceptionMapper<DomainException> {

    private static final Logger LOG = Logger.getLogger(DomainExceptionMapper.class);

    @Override
    public Response toResponse(DomainException e) {
        String traceId = TraceId.current();
        MDC.put("error_code", e.code());
        MDC.put("outcome", "failure");
        try {
            if (e.status() >= 500) {
                LOG.error("request.failed", e);
            } else {
                // Expected business outcomes are not errors. A taken slot at warn
                // level would drown a real fault on a busy day.
                LOG.debugf("request.rejected code=%s details=%s", e.code(), e.details());
            }
        } finally {
            MDC.remove("error_code");
            MDC.remove("outcome");
        }
        return Response.status(e.status())
                .type("application/problem+json")
                .entity(ProblemDetail.of(e.code(), e.status(), e.getMessage(), traceId))
                .build();
    }
}
