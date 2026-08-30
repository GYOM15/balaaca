package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The public handle is already another business's.
 *
 * <p>Distinct from {@link AlreadyRegisteredException} on purpose: one is fixed
 * by choosing another handle and the other is not fixed by anything the caller
 * can type. A client that cannot tell them apart cannot say which.
 *
 * <p>It names the slug, which is safe because the slug is public by
 * construction - it is the string on the QR code - and because a caller who
 * asked for it already knows what they asked for.
 */
public final class SlugUnavailableException extends DomainException {

    public SlugUnavailableException(String slug) {
        super("SLUG_UNAVAILABLE", 409, "That handle is already taken",
              Map.of("slug", slug));
    }
}
