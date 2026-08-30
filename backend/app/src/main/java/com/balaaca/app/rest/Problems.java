package com.balaaca.app.rest;

import com.balaaca.app.api.model.ErrorCode;
import com.balaaca.app.api.model.Problem;
import java.net.URI;

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
}
