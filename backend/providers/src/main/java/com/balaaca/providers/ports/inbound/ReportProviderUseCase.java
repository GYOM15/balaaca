package com.balaaca.providers.ports.inbound;

/**
 * A customer saying something went wrong.
 *
 * <p>Reached by a booking reference and never by a slug. That is not
 * squeamishness about abuse in general: this is a hub in a market where a
 * salon's competitor is three streets away and knows the handle, and an
 * anonymous report endpoint on a public page is a button that competitor can
 * press from a script all night.
 *
 * <p>The reference is the capability the customer already holds - 256 bits
 * minted for one appointment, the same handle they use to reschedule or cancel.
 * Requiring it means a report comes from somebody who actually booked, and it
 * arrives with the appointment attached.
 */
public interface ReportProviderUseCase {

    /**
     * @throws com.balaaca.providers.domain.UnknownBookingReferenceException when
     *         the reference names no appointment
     */
    void report(String reference, String reason, java.util.Optional<String> details);
}
