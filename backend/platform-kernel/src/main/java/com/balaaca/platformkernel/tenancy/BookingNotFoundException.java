package com.balaaca.platformkernel.tenancy;

import com.balaaca.sharedkernel.error.DomainException;

/**
 * The booking reference names nothing reachable.
 *
 * <p>A sibling of {@link ProviderNotPublishedException}, and for the same
 * reason: a capability that resolves to no tenant cannot bind one, and the
 * request stops before any business rule is consulted.
 *
 * <p>It carries nothing - not even the reference. A reference is the whole
 * authorisation for one appointment, so echoing it into an error body puts it
 * into logs and proxies that had no reason to hold it.
 */
public final class BookingNotFoundException extends DomainException {

    public BookingNotFoundException() {
        super("RESOURCE_NOT_FOUND", 404, "No such booking");
    }
}
