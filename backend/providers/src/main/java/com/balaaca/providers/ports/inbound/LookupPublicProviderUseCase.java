package com.balaaca.providers.ports.inbound;

import java.time.ZoneId;
import java.util.Optional;
import java.util.OptionalDouble;

/**
 * The provider's own half of its public page.
 *
 * <p>A separate projection rather than {@link ManageProviderProfileUseCase}'s
 * with fields dropped later: a shape cannot leak what it does not carry, while a
 * runtime filter is one refactor away from carrying everything. What is absent
 * here is absent on purpose - the platform standing, and whether the page is
 * published, are the platform's business and the provider's, not a customer's.
 *
 * <p>The tenant is bound from a published slug before this is called, so an
 * unpublished provider never reaches it.
 */
public interface LookupPublicProviderUseCase {

    PublicProvider publicPage();

    record PublicProvider(String slug,
                          String businessName,
                          Optional<String> description,
                          Optional<String> categorySlug,
                          Optional<String> city,
                          Optional<String> addressLine,
                          OptionalDouble latitude,
                          OptionalDouble longitude,
                          Optional<String> logoUrl,
                          Optional<String> coverUrl,
                          Optional<String> publicPhoneE164,
                          Optional<String> whatsappPhoneE164,
                          ZoneId timezone) {
    }
}
