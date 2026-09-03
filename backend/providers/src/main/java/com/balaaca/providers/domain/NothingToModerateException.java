package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * No such business, or it is already in the standing being asked for.
 *
 * <p>One answer for both, like every other lookup on this API. The route is
 * held by the operator alone so an existence oracle here is belt and braces,
 * but a second code would still have to be published, branched on, and kept
 * meaning the same thing for ever - for a distinction nobody acts on.
 */
public final class NothingToModerateException extends DomainException {

    public NothingToModerateException(String slug) {
        super("RESOURCE_NOT_FOUND", 404, "No business to act on",
              Map.of("slug", slug));
    }
}
