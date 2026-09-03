package com.balaaca.notificationworker.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A row this worker has claimed, and everything it will ever know about it.
 *
 * <p>There is no appointment here, no customer and no offering, because the
 * worker's database role cannot read those tables. That is not a limitation to
 * work around: it is what keeps a drain bug from becoming a cross-tenant leak,
 * and what keeps a message truthful about the moment it was owed rather than
 * about whatever the data says by the time it is sent.
 *
 * @param preferredChannel how the recipient asked to be reached about this
 *                         appointment, frozen when the row was planned. Both
 *                         addresses travel with it wherever they exist, so a
 *                         message the preferred transport cannot carry is sent
 *                         by the other one rather than dropped
 * @param payload  the template variables as raw JSON, rendered by the channel
 * @param attempts how many sends have already failed, for the backoff
 */
public record ClaimedNotification(UUID id,
                                  UUID providerId,
                                  String kind,
                                  Optional<String> toPhoneE164,
                                  Optional<String> toEmail,
                                  Channel preferredChannel,
                                  String locale,
                                  String payload,
                                  String dedupeKey,
                                  int attempts) {

    /**
     * The transports a message can actually be addressed by, in the order they
     * are tried once the preferred one is out of the way.
     *
     * <p>SMS is in the column's vocabulary and is not here: there is no adapter
     * and no account behind it, so routing to it would be a promise nothing
     * keeps.
     */
    private static final List<Channel> DELIVERABLE = List.of(Channel.WHATSAPP, Channel.EMAIL);

    public ClaimedNotification {
        // A blank column is not an address. ck_notifications_destination only
        // demands that one of the two be NOT NULL, and the empty string
        // satisfies it - so a row addressed to '' reaches here looking
        // deliverable and would be handed to a gateway that answers no, six
        // times, before anybody hears about it.
        toPhoneE164 = addressOrEmpty(toPhoneE164);
        toEmail = addressOrEmpty(toEmail);
    }

    /** @return the address this transport would send to, when the row carries one */
    public Optional<String> addressFor(Channel transport) {
        return transport == Channel.EMAIL ? toEmail : toPhoneE164;
    }

    /** The preferred transport first, then whatever else could carry the message. */
    public List<Channel> transportOrder() {
        return java.util.stream.Stream.concat(
                        java.util.stream.Stream.of(preferredChannel),
                        DELIVERABLE.stream().filter(c -> c != preferredChannel))
                .toList();
    }

    /**
     * The same message, addressed by one transport and no other.
     *
     * <p>This is how the fallback is expressed: the router decides, and the
     * adapter receives a row it cannot misread. An adapter given both addresses
     * would have to choose, which is the router's job, and would then have to
     * report which one it chose, which is what {@code channel_used} already
     * records.
     */
    public ClaimedNotification addressedBy(Channel transport) {
        return new ClaimedNotification(
                id, providerId, kind,
                transport == Channel.EMAIL ? Optional.empty() : toPhoneE164,
                transport == Channel.EMAIL ? toEmail : Optional.empty(),
                transport, locale, payload, dedupeKey, attempts);
    }

    private static Optional<String> addressOrEmpty(Optional<String> value) {
        return value.filter(v -> !v.isBlank());
    }
}
