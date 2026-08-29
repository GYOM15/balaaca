package com.balaaca.booking.application;

import com.balaaca.booking.domain.BookedSlot;
import com.balaaca.booking.domain.BookingExceptions.NoEligibleStaffException;
import com.balaaca.booking.ports.inbound.BookAppointmentUseCase.BookAppointmentCommand;
import com.balaaca.booking.ports.outbound.AppointmentRepository;
import com.balaaca.booking.ports.outbound.AppointmentRepository.InsertOutcome;
import com.balaaca.booking.ports.outbound.AppointmentRepository.NewAppointment;
import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.catalog.ports.inbound.LookupServiceOfferingUseCase;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.CustomerId;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.UUID;

/**
 * One booking attempt, in its own transaction.
 *
 * <p>Separate from {@link BookAppointmentService} because a retry needs a fresh
 * transaction: once a statement fails, the current one is rollback-only and
 * nothing further can run in it.
 */
@ApplicationScoped
public class BookAppointmentAttempt {

    private final LookupServiceOfferingUseCase offerings;
    private final AppointmentRepository appointments;

    public BookAppointmentAttempt(LookupServiceOfferingUseCase offerings,
                                  AppointmentRepository appointments) {
        this.offerings = offerings;
        this.appointments = appointments;
    }

    /**
     * @param excluded staff already found booked in an earlier attempt, skipped
     *                 so the loop makes progress instead of retrying the same
     *                 candidate
     */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public InsertOutcome once(BookAppointmentCommand command, List<StaffId> excluded) {
        BookableOffering offering = offerings.requireBookable(command.serviceOfferingId());
        // The application layer, not the domain, is where the two contexts meet.
        BookedSlot slot = BookedSlot.from(command.startsAt(), offering.duration(),
                                          offering.bufferBefore(), offering.bufferAfter());

        StaffId staffId = command.staffId().orElseGet(() -> pick(command, excluded));
        CustomerId customerId = appointments.upsertCustomer(command.customer());

        return appointments.insertIfAbsent(new NewAppointment(
                AppointmentId.of(UUID.randomUUID()),
                staffId,
                offering,
                slot,
                customerId,
                command.source(),
                command.idempotency().map(i -> i.key()),
                command.idempotency().map(i -> i.requestHash())));
    }

    /**
     * Candidates the caller has not already found booked.
     *
     * <p>Transactional even though it only reads: the RLS session variable is
     * set with {@code is_local = true}, so outside a transaction it lasts one
     * statement and the following SELECT runs with no tenant bound - returning
     * zero staff, and turning every server-chosen booking into a spurious
     * "no eligible staff". Verified against the database, not assumed.
     */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<StaffId> candidates(BookAppointmentCommand command) {
        return command.staffId()
                .map(List::of)
                .orElseGet(() -> appointments.eligibleStaff(command.serviceOfferingId()));
    }

    private StaffId pick(BookAppointmentCommand command, List<StaffId> excluded) {
        return appointments.eligibleStaff(command.serviceOfferingId()).stream()
                .filter(id -> !excluded.contains(id))
                .findFirst()
                .orElseThrow(() -> new NoEligibleStaffException(command.startsAt()));
    }
}
