package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * Three, and the cap is a promise about the page rather than about disk.
 *
 * <p>A provider page already carries its catalogue's own photographs. Twenty
 * customer pictures underneath them is a page that never finishes loading on a
 * mid-range Android over 3G, which is the machine this product is for - and the
 * provider pays for that in customers who closed it.
 */
public final class TooManyReviewPhotosException extends DomainException {

    public TooManyReviewPhotosException() {
        super("VALIDATION_FAILED", 422,
              "A review carries at most three photographs",
              Map.of("limit", "3", "remedy", "remove one before adding another"));
    }
}
