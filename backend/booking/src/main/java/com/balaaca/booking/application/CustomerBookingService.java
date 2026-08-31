package com.balaaca.booking.application;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookingExceptions.AppointmentNotFoundException;
import com.balaaca.booking.domain.BookingExceptions.CancellationDeadlinePassedException;
import com.balaaca.booking.ports.inbound.CancelAppointmentUseCase;
import com.balaaca.booking.ports.inbound.CustomerBookingUseCase;
import com.balaaca.booking.ports.outbound.CustomerBookingRepository;
import com.balaaca.booking.ports.outbound.CustomerBookingRepository.BookingSnapshot;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

/**
 * What a customer can do about their own appointment.
 *
 * <p>The deadline is applied here and not in {@link CancelAppointmentService},
 * because it binds the customer and not the provider: a salon cancelling its own
 * appointment is managing its diary, and being refused by its own notice period
 * would be absurd. Same table, same transition, two different callers, and only
 * one of them is subject to the policy.
 */
@ApplicationScoped
public class CustomerBookingService implements CustomerBookingUseCase {

    private final CustomerBookingRepository bookings;
    private final CancelAppointmentUseCase cancellation;
    private final Clock clock;

    public CustomerBookingService(CustomerBookingRepository bookings,
                                  CancelAppointmentUseCase cancellation,
                                  Clock clock) {
        this.bookings = bookings;
        this.cancellation = cancellation;
        this.clock = clock;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public CustomerBooking byReference(String reference) {
        return view(require(reference));
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public CustomerBooking cancel(String reference, Optional<String> reason) {
        BookingSnapshot snapshot = require(reference);

        // Read before the write, and that is safe here in a way it would not be
        // on the booking path: the deadline is a function of this appointment's
        // own start and the provider's policy, neither of which another request
        // can move underneath us. What decides whether the cancellation happens
        // at all is still the conditional UPDATE inside cancel().
        Instant deadline = deadline(snapshot);
        if (!clock.instant().isBefore(deadline)) {
            throw new CancellationDeadlinePassedException(deadline);
        }

        cancellation.cancel(snapshot.id(), reason);

        // Re-read rather than patch the snapshot: the status the customer is
        // shown is the one the database now holds.
        return view(require(reference));
    }

    private BookingSnapshot require(String reference) {
        return bookings.byReference(reference)
                .orElseThrow(() -> new AppointmentNotFoundException(null));
    }

    private static Instant deadline(BookingSnapshot snapshot) {
        return snapshot.startsAt().minus(snapshot.cancellationWindow());
    }

    private CustomerBooking view(BookingSnapshot snapshot) {
        boolean open = AppointmentStatus.valueOf(snapshot.status()) == AppointmentStatus.PENDING
                || AppointmentStatus.valueOf(snapshot.status()) == AppointmentStatus.CONFIRMED;
        Instant deadline = deadline(snapshot);

        return new CustomerBooking(
                snapshot.reference(), snapshot.providerSlug(), snapshot.providerName(),
                snapshot.serviceName(), snapshot.staffName(),
                snapshot.startsAt(), snapshot.endsAt(), snapshot.status(), snapshot.price(),
                snapshot.timezone(),
                // Absent rather than a date in the past: a client showing a
                // deadline that has gone invites a customer to try, and be
                // refused for a reason they could have been spared.
                open && clock.instant().isBefore(deadline)
                        ? Optional.of(deadline)
                        : Optional.empty());
    }
}
