package com.balaaca.platformkernel.tenancy;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The caller belongs here and may not do this.
 *
 * <p>Answered with the same {@code FORBIDDEN} an insufficient scope gets, and
 * saying nothing about who the owner is. The distinction between "you are not
 * staff here" and "you are staff and not the owner" is real, and it is the
 * platform's to know rather than a caller's to be told.
 */
public final class NotProviderOwnerException extends DomainException {

    public NotProviderOwnerException(String action) {
        super("FORBIDDEN", 403, "Only the owner of this business may do that",
              Map.of("action", action));
    }
}
