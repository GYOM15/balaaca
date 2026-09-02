package com.balaaca.booking.domain;

import com.balaaca.booking.domain.BookingExceptions.EmailChannelWithoutAddressException;
import java.util.Optional;

/**
 * How somebody wants to be reached about one appointment.
 *
 * <p>Two values, and the third is deliberately absent. SMS exists in the
 * worker's {@code channel_used} vocabulary and has neither an adapter nor an
 * account behind it, so publishing it as a choice would let a customer pick a
 * channel nothing can send on.
 *
 * <p>It is a property of the BOOKING, not of the person. Customers are upserted
 * on (provider_id, phone_e164), so a preference kept against the number would
 * be rewritten by the next booking and would silently re-address the messages
 * an earlier one still owes.
 */
public enum ContactChannel {

    /** The number the booking was made with, which every customer has. */
    WHATSAPP,

    /** The address on the same contact, which is then no longer optional. */
    EMAIL;

    /**
     * What the customer chose, refused if it cannot be honoured.
     *
     * <p>Absent means {@link #WHATSAPP}: that is what every caller sent before
     * the field existed, and reading it as anything else would change the
     * meaning of requests already in flight inside one version of the API.
     *
     * <p>The refusal happens here, at the edge, and not when the message falls
     * due. A row addressed to nowhere is discovered by the worker hours later,
     * on a thread that has nobody to answer, and what the customer sees is a
     * confirmation that never arrives.
     */
    public static ContactChannel chosen(Optional<ContactChannel> choice, Optional<String> email) {
        ContactChannel channel = choice.orElse(WHATSAPP);
        if (channel == EMAIL && email.isEmpty()) {
            throw new EmailChannelWithoutAddressException();
        }
        return channel;
    }

    /**
     * The channel a destination that published only one way to be reached can
     * actually use.
     *
     * <p>For the provider's own notices, which are addressed to whatever the
     * business published. A salon that gave only an e-mail address is reachable
     * by e-mail, and stamping WhatsApp on that row would be a message with
     * nowhere to go.
     */
    public static ContactChannel reachableAt(Optional<String> phoneE164) {
        return phoneE164.isPresent() ? WHATSAPP : EMAIL;
    }
}
