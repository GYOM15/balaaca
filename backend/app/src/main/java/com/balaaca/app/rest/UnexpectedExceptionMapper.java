package com.balaaca.app.rest;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;

/**
 * Anything not modelled as a domain failure. The cause goes to the log with a
 * trace id; the client gets that id and nothing else, so a driver message, a
 * hostname or a constraint name can never leak through an unhandled path.
 */
@Provider
public class UnexpectedExceptionMapper implements ExceptionMapper<Throwable> {

    private static final Logger LOG = Logger.getLogger(UnexpectedExceptionMapper.class);

    @Override
    public Response toResponse(Throwable e) {
        if (e instanceof WebApplicationException web) {
            return web.getResponse();
        }
        String traceId = TraceId.current();
        LOG.errorf(e, "request.unhandled traceId=%s", traceId);
        return Response.status(500)
                .type("application/problem+json")
                .entity(ProblemDetail.of("INTERNAL_ERROR", 500, "Unexpected error", traceId))
                .build();
    }
}
