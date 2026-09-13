package com.balaaca.app.rest;

import com.balaaca.app.api.model.ErrorCode;
import com.balaaca.app.api.model.FieldError;
import com.balaaca.app.api.model.Problem;
import java.net.URI;
import java.util.List;

/**
 * Builds the one error body a client ever sees.
 *
 * <p>{@link Problem} and {@link ErrorCode} are generated from the contract, so
 * the enum here IS the published catalogue: a handler that invents a code no
 * longer compiles into a response, it fails to resolve at all. That is the
 * point of generating them - the closed list stops being a promise in a
 * document and becomes a type.
 */
final class Problems {

    private static final String TYPE_PREFIX = "https://errors.balaaca.com/";

    private Problems() {
    }

    static Problem of(ErrorCode code, int status, String title, String traceId) {
        return new Problem()
                .type(URI.create(TYPE_PREFIX + code.toString().toLowerCase().replace('_', '-')))
                .title(title)
                .status(status)
                .code(code)
                .instance(traceId);
    }

    /**
     * The same refusal, naming the fields it refused.
     *
     * <p>Paths only. A bean validation message quotes the value it rejected,
     * and on the public booking endpoint that value is somebody's telephone
     * number, so the message never leaves this process. What the client needs
     * is which of its own boxes to point at, and the path says that.
     *
     * <p>An empty list is passed through rather than special-cased. The
     * generated model initialises the collection, so `errors` serialises as
     * `[]` whatever this does, and pretending otherwise would put a promise in
     * the contract that the wire does not keep.
     */
    static Problem of(ErrorCode code, int status, String title, String traceId,
                      List<FieldError> errors) {
        Problem problem = of(code, status, title, traceId);
        return errors.isEmpty() ? problem : problem.errors(errors);
    }
}
