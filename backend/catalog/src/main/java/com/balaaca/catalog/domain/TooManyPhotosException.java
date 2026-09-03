package com.balaaca.catalog.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * Five is the cap, and it is a promise about the page rather than about disk.
 *
 * <p>Five pictures is nothing to store. A catalogue of twelve services with no
 * limit, on a mid-range Android telephone over 3G, is a page that never
 * finishes loading - and the provider pays for that in customers who closed it,
 * not the platform.
 */
public final class TooManyPhotosException extends DomainException {

    public TooManyPhotosException() {
        super("VALIDATION_FAILED", 422,
              "A service carries at most five photographs",
              Map.of("limit", "5", "remedy", "remove one before adding another"));
    }
}
