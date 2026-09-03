package com.balaaca.app.rest;

import com.balaaca.app.api.model.ErrorCode;
import io.quarkus.hibernate.validator.runtime.jaxrs.ResteasyReactiveViolationException;
import jakarta.annotation.Priority;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

/**
 * A malformed request, answered in the same shape as every other refusal.
 *
 * <p>Without this the container's own 400 goes out: a different body, with no
 * {@code code}, on a path the contract documents as
 * {@code 400 VALIDATION_FAILED}. A client branching on the catalogue would find
 * nothing to branch on, which makes the published enum a half-truth.
 *
 * <p>A missing {@code Idempotency-Key} arrives here too - it is a
 * {@code @NotNull} header parameter on the generated interface - and is told
 * apart by name, because "you forgot the key" and "your body is wrong" are
 * different problems for the caller to fix.
 *
 * <p>The violations themselves are not serialised. They quote the rejected
 * value, and on this endpoint that value is a customer's phone number.
 *
 * <p>Typed on the Quarkus subclass, not on {@code ConstraintViolationException}:
 * the framework registers its own mapper for that subclass, and JAX-RS picks
 * the most specific type before it looks at priority. A mapper on the supertype
 * compiles, registers, and never runs. Priority then settles the tie against
 * the built-in one, which is registered for the same type.
 */
@Provider
@Priority(1)
public class ValidationExceptionMapper
        implements ExceptionMapper<ResteasyReactiveViolationException> {

    private static final String IDEMPOTENCY_KEY = "idempotencyKey";

    @Override
    public Response toResponse(ResteasyReactiveViolationException e) {
        boolean missingKey = e.getConstraintViolations().stream()
                .anyMatch(v -> v.getPropertyPath().toString().endsWith(IDEMPOTENCY_KEY));

        ErrorCode code = missingKey ? ErrorCode.IDEMPOTENCY_KEY_REQUIRED : ErrorCode.VALIDATION_FAILED;
        String title = missingKey
                ? "An Idempotency-Key header is required"
                : "The request is not valid";

        return Response.status(400)
                .type("application/problem+json")
                .entity(Problems.of(code, 400, title, TraceId.current()))
                .build();
    }
}
