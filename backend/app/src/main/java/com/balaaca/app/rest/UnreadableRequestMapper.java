package com.balaaca.app.rest;

import com.balaaca.app.api.model.ErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import jakarta.ws.rs.core.Response;
import org.jboss.resteasy.reactive.server.ServerExceptionMapper;

/**
 * A body the reader could not turn into the request type.
 *
 * <p>This failure never reaches Bean Validation: the generated wire types mark
 * required properties on the creator, so a body missing one fails during
 * deserialisation. The contract documents that path as
 * {@code 400 VALIDATION_FAILED}, and what the framework answers instead is its
 * own shape:
 *
 * <pre>{@code {"object_name":"Class","attribute_name":"service_offering_id",
 *  "line":1,"column":2,"value":null}}</pre>
 *
 * <p>Two things are wrong with it. It carries no {@code code}, so a client has
 * nothing to branch on and falls back to parsing prose; and it reports the
 * parser's position and the attribute it choked on, which on this endpoint is
 * one field away from echoing a customer's details back to whoever sent them.
 *
 * <p>A {@code @ServerExceptionMapper} with an explicit priority, not a
 * {@code @Provider}: the built-in is registered for the same exception, and a
 * plain provider loses to it silently - the mapper compiles, registers, and
 * never runs.
 */
public class UnreadableRequestMapper {

    /**
     * Both types, because the built-in registers the narrower one and JAX-RS
     * matches the most specific first: a mapper on the supertype alone loses
     * every missing-property body, which is the common case.
     */
    @ServerExceptionMapper(value = MismatchedInputException.class, priority = 1)
    public Response mismatched(MismatchedInputException e) {
        return badRequest();
    }

    @ServerExceptionMapper(value = JsonProcessingException.class, priority = 1)
    public Response unparseable(JsonProcessingException e) {
        return badRequest();
    }

    private static Response badRequest() {
        return Response.status(400)
                .type("application/problem+json")
                .entity(Problems.of(ErrorCode.VALIDATION_FAILED, 400,
                                    "The request body is not valid", TraceId.current()))
                .build();
    }
}
