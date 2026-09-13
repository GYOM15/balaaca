package com.balaaca.app.rest;

import com.balaaca.app.api.model.ErrorCode;
import com.balaaca.app.api.model.FieldError;
import io.quarkus.hibernate.validator.runtime.jaxrs.ResteasyReactiveViolationException;
import jakarta.annotation.Priority;
import jakarta.validation.ConstraintViolation;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

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
 * <p>The violation MESSAGES are still not serialised. They quote the rejected
 * value, and on this endpoint that value is a customer's phone number. Only the
 * property path leaves, because that is what lets a client point at its own
 * box, and a path carries no value.
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
                .entity(Problems.of(code, 400, title, TraceId.current(), fields(e)))
                .build();
    }

    /**
     * The refused fields, as the CONTRACT spells them.
     *
     * <p>Bean validation reports a path rooted at the method it validated:
     * {@code bookAppointment.bookAppointmentRequest.customer.phone}. The first
     * two segments are the method and its parameter, which are this server's
     * names for things and mean nothing to a caller, so they are dropped and
     * {@code customer.phone} goes out - the path the request itself used.
     *
     * <p>A path with nothing left after the drop names a parameter rather than a
     * field, a header or a path segment, and yields no entry: "your body is
     * wrong at &lt;nothing&gt;" is worse than saying only that it is wrong.
     *
     * <p>Sorted, because two requests refused for the same two reasons must
     * answer in the same order. An unordered set makes a response body that
     * changes between identical calls, which is the kind of thing that gets
     * diagnosed as a flaky client.
     */
    private static List<FieldError> fields(ResteasyReactiveViolationException e) {
        return e.getConstraintViolations().stream()
                .map(ValidationExceptionMapper::wirePath)
                .flatMap(Optional::stream)
                .distinct()
                .sorted(Comparator.naturalOrder())
                .map(path -> new FieldError().field(path))
                .toList();
    }

    private static Optional<String> wirePath(ConstraintViolation<?> violation) {
        String[] segments = violation.getPropertyPath().toString().split("\\.");
        if (segments.length <= 2) {
            return Optional.empty();
        }
        return Optional.of(List.of(segments).subList(2, segments.length).stream()
                .map(ValidationExceptionMapper::snakeCase)
                .collect(Collectors.joining(".")));
    }

    /**
     * The contract's spelling, not the generator's.
     *
     * <p>Bean validation reports Java property names, and the generator turns
     * every snake_case wire field into a camelCase one: the request says
     * {@code full_name} and the violation says {@code fullName}. Sending the
     * second would publish this server's naming convention as part of the
     * contract, and a client matching on the path it actually sent would miss.
     */
    private static String snakeCase(String property) {
        StringBuilder out = new StringBuilder(property.length() + 4);
        for (char c : property.toCharArray()) {
            if (Character.isUpperCase(c)) {
                out.append('_').append(Character.toLowerCase(c));
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }
}
