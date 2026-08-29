package com.balaaca.platformkernel.tenancy;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The caller has no resolvable tenant. Fail-closed: this is thrown rather than
 * defaulting to any provider, because a default here is a cross-tenant breach.
 */
public final class NoProviderMembershipException extends DomainException {

    public NoProviderMembershipException(String keycloakSubject) {
        // The subject is a Keycloak identifier, not personal data, so it is safe
        // to keep for the audit trail. It never reaches the client.
        super("FORBIDDEN", 403, "No provider membership for the authenticated subject",
              Map.of("keycloak_subject", String.valueOf(keycloakSubject)));
    }
}
