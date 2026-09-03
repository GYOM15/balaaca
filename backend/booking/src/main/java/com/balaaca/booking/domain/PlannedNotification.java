package com.balaaca.booking.domain;

import com.balaaca.sharedkernel.ids.AppointmentId;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * One row the outbox is about to hold, as a value.
 *
 * <p>Self-contained on purpose. The worker runs under a role that can read this
 * table and nothing else, so it can never join back to the appointment, the
 * customer or the offering. Everything a message needs is frozen here at
 * planning time - which also keeps the message truthful about the moment it was
 * owed, rather than about whatever the data says when it is finally sent.
 *
 * @param owedFor    the DOMAIN instant this message exists for, and the only
 *                   time-like thing in the dedupe key. Never a clock read: a
 *                   replayed transaction has to recompute the identical key for
 *                   the UNIQUE index to absorb it, and a fresh {@code now()}
 *                   would produce a second row and a second message
 * @param scheduledAt when the worker may send it, which for an immediate
 *                    message is simply now. It is delivery, not identity, so it
 *                    stays out of the key
 * @param payload    template variables under stable English keys. No secret,
 *                   and no more of the customer than the message needs
 * @param preferredChannel how the recipient asked to be reached about this
 *                   appointment, frozen here with everything else. Both
 *                   addresses still travel where they exist, so the worker can
 *                   fall back rather than drop a message it cannot send the
 *                   preferred way
 */
public record PlannedNotification(AppointmentId appointmentId,
                                  NotificationKind kind,
                                  NotificationRecipient recipient,
                                  Optional<String> toPhoneE164,
                                  Optional<String> toEmail,
                                  ContactChannel preferredChannel,
                                  String locale,
                                  Map<String, String> payload,
                                  Instant owedFor,
                                  Instant scheduledAt) {

    public PlannedNotification {
        Objects.requireNonNull(appointmentId, "appointmentId");
        Objects.requireNonNull(kind, "kind");
        Objects.requireNonNull(recipient, "recipient");
        Objects.requireNonNull(preferredChannel, "preferredChannel");
        if (toPhoneE164.isEmpty() && toEmail.isEmpty()) {
            // ck_notifications_destination refuses this row anyway. Failing here
            // names the reason; failing there names a constraint.
            throw new IllegalArgumentException("a notification needs a phone or an email");
        }
        // And the subtler one ck_notifications_reachable closes: a row whose
        // preferred channel has no address, which the check above accepts
        // because the OTHER address is present. Planning that row hands the
        // worker a decision it was never given the means to make.
        if (preferredChannel == ContactChannel.WHATSAPP && toPhoneE164.isEmpty()) {
            throw new IllegalArgumentException("a WhatsApp notification needs a phone");
        }
        if (preferredChannel == ContactChannel.EMAIL && toEmail.isEmpty()) {
            throw new IllegalArgumentException("an email notification needs an email");
        }
        payload = Map.copyOf(payload);
    }

    /**
     * Intent plus the instant it is owed for. Deterministic, so a replay lands
     * on the UNIQUE index instead of on a second SMS; and collision-free across
     * a reschedule, because a new time is a new instant and therefore a new row
     * while the obsolete one is cancelled in the same transaction.
     *
     * <p>No version and no counter: anything that has to be incremented is
     * state two racing transactions can disagree about. And no channel either:
     * how a message travels is delivery, not identity, so a key that moved with
     * it would let one appointment send the same confirmation twice.
     */
    public String dedupeKey() {
        return "appointment:" + appointmentId.value()
                + ":" + kind.name()
                + ":" + owedFor.getEpochSecond();
    }
}
