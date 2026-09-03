package com.balaaca.booking.ports.outbound;

import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.money.Money;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/** One appointment, read by the capability its customer holds. */
public interface CustomerBookingRepository {

    /**
     * Empty when the reference names nothing THIS TENANT owns - which, since the
     * tenant was bound from that same reference, means nothing at all. No
     * provider predicate: RLS is what confines it.
     */
    Optional<BookingSnapshot> byReference(String reference);

    /**
     * @param cancellationWindow the provider's own notice period, copied from
     *                           the row rather than assumed: it is per provider
     *                           and it may change after this booking was taken
     */
    record BookingSnapshot(AppointmentId id,
                           String reference,
                           String providerSlug,
                           String providerName,
                           String serviceName,
                           String staffName,
                           Instant startsAt,
                           Instant endsAt,
                           String status,
                           Money price,
                           String timezone,
                           Optional<Instant> readyBy,
                           Optional<Instant> readyAt,
                           Duration cancellationWindow) {
    }
}
