package com.balaaca.platformkernel.tenancy;

import com.balaaca.sharedkernel.error.DomainException;

/**
 * A verified identity was required and there is none.
 *
 * <p>Distinct from {@link NoProviderMembershipException}, which is a caller the
 * platform knows and will not serve. This one is a caller it does not know at
 * all, and the two must not answer alike: 403 to someone with no token says
 * their account lacks a permission, sending them to look for one.
 */
public final class UnauthenticatedException extends DomainException {

    public UnauthenticatedException() {
        super("UNAUTHENTICATED", 401, "No verified subject on this request");
    }
}
