package com.balaaca.booking.ports.inbound;

import com.balaaca.sharedkernel.money.Money;
import java.time.Instant;
import java.util.Optional;

/**
 * What a customer can do about their own appointment, without an account.
 *
 * <p>Customers do not sign in and will not be made to. The reference minted at
 * booking is the whole authorisation: it names one appointment, it grants
 * nothing else, and it is the only thing that distinguishes the person who
 * booked from a stranger.
 *
 * <p>The tenant is bound from the reference before either method runs, the same
 * way the public page binds from a slug - so an appointment that is not the
 * reference's is not filtered out here, it is invisible.
 */
public interface CustomerBookingUseCase {

    /** @throws com.balaaca.booking.domain.BookingExceptions.AppointmentNotFoundException unknown */
    CustomerBooking byReference(String reference);

    /**
     * Calls it off, if the provider's own deadline has not passed.
     *
     * <p>The deadline binds the CUSTOMER and not the provider. It exists to stop
     * a chair being emptied an hour before it was due; a salon cancelling its
     * own appointment is managing its diary, and being refused by its own policy
     * would be absurd. `cancellation_deadline_minutes` has been a column since
     * V004 and was enforced nowhere, which is the same thing as not having it.
     *
     * @throws com.balaaca.booking.domain.BookingExceptions.CancellationDeadlinePassedException too late
     */
    CustomerBooking cancel(String reference, Optional<String> reason);

    /**
     * Moves it, if the same deadline has not passed.
     *
     * <p>Bound by the CANCELLATION deadline, because it is the same disruption:
     * a chair emptied an hour before it was due is emptied whether or not
     * something is put in its place. This capability only ever had one half -
     * a customer who needed Thursday instead of Wednesday had to call the
     * appointment off, releasing the slot to whoever refreshed first, and book
     * again.
     *
     * <p>The service and the colleague do not change. A customer wanting either
     * is making a new booking, and letting this operation do it would be a way
     * to acquire one slot while still holding another.
     *
     * @throws com.balaaca.booking.domain.BookingExceptions.CancellationDeadlinePassedException too late
     * @throws com.balaaca.booking.domain.BookingExceptions.SlotUnavailableException
     *         the same person is busy at the new time
     */
    CustomerBooking reschedule(String reference, Instant newStartsAt);

    /**
     * What the customer is shown. No staff identifier, no appointment id, no
     * customer id: the reference is the only handle, and publishing a second one
     * would be publishing a second way in.
     *
     * @param cancellableUntil absent when the appointment can no longer be
     *                         called off at all - already over, or already
     *                         cancelled
     */
    record CustomerBooking(String reference,
                           String providerSlug,
                           String providerName,
                           String serviceName,
                           String staffName,
                           Instant startsAt,
                           Instant endsAt,
                           String status,
                           Money price,
                           /** The provider's IANA zone: what turns the instants into a reading. */
                           String timezone,
                           /** Both empty unless the work was handed over. */
                           Optional<Instant> readyBy,
                           Optional<Instant> readyAt,
                           Optional<Instant> cancellableUntil) {
    }
}
