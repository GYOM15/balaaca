package com.balaaca.providers.ports.inbound;

import com.balaaca.providers.domain.ProviderStatus;
import java.time.ZoneId;
import java.util.Optional;

/**
 * The page a provider publishes about itself, read and written.
 *
 * <p>No provider identifier: the tenant is ambient. Singular throughout,
 * because the caller has exactly one and there is no collection to select from.
 */
public interface ManageProviderProfileUseCase {

    ProviderProfile current();

    /**
     * The whole profile, for the same reason opening hours are replaced a week
     * at a time: a partial edit leaves the question of what happened to the
     * fields nobody mentioned.
     *
     * @throws com.balaaca.providers.domain.NothingToPublishException when the
     *         edit asks to publish a page with nothing bookable on it
     */
    ProviderProfile replace(ProfileEdit edit);

    /**
     * @param slug the public handle. Read-only here: it is on the QR code and in
     *             every message already sent, and changing it breaks all of them
     * @param status the platform's standing, which the provider does not set
     */
    record ProviderProfile(String slug,
                           String businessName,
                           Optional<String> description,
                           Optional<String> categorySlug,
                           Optional<String> city,
                           Optional<String> addressLine,
                           Optional<String> publicPhoneE164,
                           Optional<String> publicEmail,
                           Optional<String> whatsappPhoneE164,
                           ZoneId timezone,
                           boolean published,
                           ProviderStatus status) {
    }

    /** Everything a provider may change about its own page, and nothing else. */
    record ProfileEdit(String businessName,
                       Optional<String> description,
                       Optional<String> categorySlug,
                       Optional<String> city,
                       Optional<String> addressLine,
                       Optional<String> publicPhoneE164,
                       Optional<String> publicEmail,
                       Optional<String> whatsappPhoneE164,
                       ZoneId timezone,
                       boolean published) {
    }
}
