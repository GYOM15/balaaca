package com.balaaca.app.rest;

import com.balaaca.sharedkernel.error.DomainException;

/**
 * A refusal that knows which wire field it refused.
 *
 * <p>The domain refuses values, not fields: {@code PhoneNumber} rejects a
 * string it cannot parse and has no idea whether that string arrived as a
 * customer's telephone on a public booking or as a provider's WhatsApp number
 * on their own profile. Both are the same exception, and a table from exception
 * class to field path would therefore be right on one endpoint and wrong on the
 * next.
 *
 * <p>So the edge says it. A request mapper knows the path it read a value from,
 * because it just read it, and wrapping the domain's refusal here is the one
 * place where a wire name and a domain rule meet. Nothing in the core imports
 * this class, and nothing in it names a domain concept.
 *
 * <p>The cause is kept: the log line still carries what the domain said, which
 * is the half of the story this class does not tell.
 */
final class RefusedFieldException extends DomainException {

    private final String field;

    private RefusedFieldException(String field, DomainException cause) {
        super("VALIDATION_FAILED", 400, cause.getMessage(), cause.details(), cause);
        this.field = field;
    }

    /**
     * Runs the parse and names the field if it refuses.
     *
     * @param field the path as the CONTRACT spells it, never as the server does
     */
    static <T> T at(String field, java.util.function.Supplier<T> parse) {
        try {
            return parse.get();
        } catch (DomainException e) {
            throw new RefusedFieldException(field, e);
        }
    }

    String field() {
        return field;
    }
}
