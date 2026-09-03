package com.balaaca.platformkernel.tenancy;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The slug names no published provider. Deliberately indistinguishable from a
 * slug that does not exist: telling the two apart would confirm the existence
 * of an unpublished provider to anyone who guesses its name.
 */
public final class ProviderNotPublishedException extends DomainException {

    public ProviderNotPublishedException(String slug) {
        super("RESOURCE_NOT_FOUND", 404, "No such provider", Map.of("slug", String.valueOf(slug)));
    }
}
