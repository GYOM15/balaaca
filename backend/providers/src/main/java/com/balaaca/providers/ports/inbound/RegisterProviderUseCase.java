package com.balaaca.providers.ports.inbound;

import com.balaaca.platformkernel.tenancy.ProviderId;
import java.time.ZoneId;
import java.util.Optional;

/**
 * Bringing a business into existence.
 *
 * <p>The one operation on this platform that runs with no tenant bound, because
 * it is what creates one. Every other authenticated capability resolves a
 * provider from the verified subject through {@code users} and {@code
 * provider_staff}; until this has written those rows, a salon that signed up can
 * authenticate and be refused by everything.
 */
public interface RegisterProviderUseCase {

    RegisteredProvider register(Registration registration);

    /**
     * Who the caller is, taken from the verified token and never from a request
     * body. A caller does not get to choose their own identity, and a display
     * name they typed would be the name on the audit trail.
     *
     * @param subject the opaque Keycloak identifier
     */
    record Account(String subject, String displayName, Optional<String> email) {
    }

    /**
     * What the business says about itself. No identifier of any kind: the
     * provider does not exist yet, and the account is the {@link Account}.
     */
    record Registration(Account account,
                        String slug,
                        String businessName,
                        Optional<String> categorySlug,
                        Optional<String> city,
                        ZoneId timezone) {
    }

    /**
     * The tenant, returned once because a caller that has just created something
     * is entitled to know what it created. It is never accepted back: every
     * later request resolves it server-side.
     */
    record RegisteredProvider(ProviderId id, String slug) {
    }
}
