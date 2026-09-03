package com.balaaca.providers.ports.inbound;

import java.time.ZoneId;
import java.util.Optional;

/**
 * What the platform needs in order to address the current tenant and its
 * customers.
 *
 * <p>Not the provider aggregate, and not the profile a provider edits: this is
 * the projection {@code booking} needs - the name to put in a message, the zone
 * its times are written in, the country its customers' phone numbers belong to,
 * and where a notice reaches the business. Publishing the aggregate would let
 * every context depend on this one's domain, and every reshape would ripple
 * outward.
 *
 * <p>{@code countryCode} is here because it was a column nothing read while the
 * booking edge passed a hardcoded "GN" - against a product rule that says
 * nothing may hardcode a single market, and against PhoneNumber's own javadoc,
 * which already said the region comes from the provider's country.
 *
 * @param noticeDestination where a staff-facing message goes, empty when the
 *                          provider has published no way to be reached
 */
public record NoticeProfile(String businessName,
                            ZoneId timezone,
                            String countryCode,
                            Optional<NoticeDestination> noticeDestination) {

    /**
     * A phone or an email, never neither: the notifications table refuses a row
     * with no destination, and a message with nowhere to go is not a message.
     */
    public record NoticeDestination(Optional<String> phoneE164, Optional<String> email) {

        public NoticeDestination {
            if (phoneE164.isEmpty() && email.isEmpty()) {
                throw new IllegalArgumentException("a destination needs a phone or an email");
            }
        }
    }
}
