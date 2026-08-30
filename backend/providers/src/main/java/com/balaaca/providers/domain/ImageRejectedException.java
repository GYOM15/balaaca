package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The bytes are not an image this platform will publish.
 *
 * <p>The reason is specific enough to fix and vague enough to be safe: a
 * provider is told the file is too large or not a JPEG, never which decoder
 * threw or where. A parser's own message is a description of the parser.
 */
public final class ImageRejectedException extends DomainException {

    public ImageRejectedException(String reason) {
        super("VALIDATION_FAILED", 400, "That image was refused: " + reason,
              Map.of("reason", reason));
    }
}
