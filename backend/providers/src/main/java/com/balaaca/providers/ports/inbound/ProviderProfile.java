package com.balaaca.providers.ports.inbound;

import java.time.ZoneId;
import java.util.Optional;

/**
 * What providers publishes about the current tenant to the rest of the core.
 *
 * <p>Not the provider aggregate: publishing it would let every other context
 * depend on this one's domain, and every reshape would ripple outward. This
 * carries what a message has to say about a business - its name, the zone its
 * opening hours are written in, and where a notice reaches it - and nothing
 * providers might want to change.
 *
 * @param noticeDestination where a staff-facing message goes, empty when the
 *                          provider has published no way to be reached
 */
public record ProviderProfile(String businessName,
                              ZoneId timezone,
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
