package com.balaaca.booking.ports.outbound;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookedSlot;
import com.balaaca.booking.domain.BookingSource;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.domain.ServiceAddress;
import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.CustomerId;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface AppointmentRepository {

    /**
     * Inserts unless an identical idempotency key already exists.
     *
     * <p>One INSERT ... ON CONFLICT DO NOTHING with an explicit conflict target,
     * not a pre-SELECT: two racers both pass a check-then-insert. The explicit
     * target means only the idempotency index is arbitrated, so an exclusion
     * violation still surfaces rather than being swallowed as a duplicate.
     *
     * <p>The target must repeat the index's WHERE predicate. The idempotency
     * index is partial - keys are optional - and PostgreSQL refuses to match a
     * partial index from a bare column list.
     */
    InsertOutcome insertIfAbsent(NewAppointment appointment);

    /**
     * The appointment an earlier request with this key already created.
     *
     * <p>Empty means no request has used the key, not that the key is free to
     * take: only the insert's conflict target can say that without racing.
     * It is read before a request is judged, so that a retry is answered with
     * what it asked for rather than judged a second time.
     *
     * @throws com.balaaca.booking.domain.BookingExceptions.IdempotencyKeyReusedException
     *         when the key exists against a different request
     */
    Optional<InsertOutcome> replayOf(String idempotencyKey, String requestHash);

    /**
     * Staff who could take this booking, most lightly loaded first.
     *
     * <p>Bookable, active, AND recorded as performing this service. The last of
     * the three is what the parameter is for: before V032 it was accepted and
     * ignored, and a salon's least busy chair took a booking for work the
     * person in it does not do.
     */
    List<StaffId> eligibleStaff(ServiceOfferingId serviceOfferingId);

    /**
     * Whether this person performs this service.
     *
     * <p>Asked of a client-NAMED staff member, where the eligibility list is
     * not consulted. It says nothing about whether they are bookable or
     * active: a provider entering a walk-in may name somebody the public list
     * never offers, and that is the point of a walk-in.
     */
    boolean performs(StaffId staffId, ServiceOfferingId serviceOfferingId);

    /**
     * Whether this person may be given work at all.
     *
     * <p>Separate from {@link #performs}, because they refuse different things:
     * that one is about competence, this one is about whether the chair exists
     * any more. A member who has left keeps their competence rows - they did
     * know how to braid - and must still never receive a new appointment.
     *
     * @param mustBeBookable true for a booking a CUSTOMER made. A provider
     *                       writing a walk-in into their own diary may name
     *                       somebody the public list never offers - a
     *                       receptionist covering a chair - and that is the
     *                       point of a walk-in. Neither may name somebody who
     *                       has left.
     */
    boolean canBeAssigned(StaffId staffId, boolean mustBeBookable);

    /**
     * How many bookable staff have nothing overlapping this window.
     *
     * <p>Read after the retry budget is spent, to tell a slot that is taken
     * from a system that is merely busy. Zero means every chair is occupied and
     * the answer is 409; anything else means this caller lost a race it could
     * win on a retry.
     *
     * <p>Deliberately not a lock and not an authority: the exclusion constraint
     * remains the only thing that decides a booking. This just reports what the
     * committed data says, once nothing is left to attempt.
     *
     * @param staffId empty asks about the whole bookable team
     */
    long freeStaffCount(ServiceOfferingId serviceOfferingId, Optional<StaffId> staffId,
                        Instant blockedFrom, Instant blockedUntil);

    /** Upserts on (provider_id, phone_e164) without overwriting the provider's own edits. */
    CustomerId upsertCustomer(CustomerContact contact);

    record NewAppointment(
            AppointmentId id,
            StaffId staffId,
            BookableOffering offering,
            BookedSlot slot,
            CustomerId customerId,
            /**
             * Resolved and validated before it gets here: present iff the
             * offering travels, and its locality slug already checked against
             * the published map.
             */
            Optional<ServiceAddress> serviceAddress,
            BookingSource source,
            Optional<String> customerNote,
            Optional<String> idempotencyKey,
            Optional<String> idempotencyRequestHash) {
    }

    /**
     * @param reference the capability the customer keeps. Minted at insert and
     *                  read back on a replay, so a retried booking is handed the
     *                  same one rather than a second that reaches the same row
     */
    record InsertOutcome(AppointmentId appointmentId, String reference,
                         AppointmentStatus status, boolean replayed) {
    }
}
