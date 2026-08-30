package com.balaaca.providers.ports.inbound;

import java.time.ZoneId;
import java.util.Optional;

/**
 * What a notification has to say about the current tenant.
 *
 * <p>Not the provider aggregate, and not the profile a provider edits: this is
 * the projection {@code booking} needs to address a message - the name to put
 * in it, the zone its times are written in, and where it reaches the business.
 * Publishing the aggregate would let every context depend on this one's domain,
 * and every reshape would ripple outward.
 *
 * @param noticeDestination where a staff-facing message goes, empty when the
 *                          provider has published no way to be reached
 */
public record NoticeProfile(String businessName,
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
