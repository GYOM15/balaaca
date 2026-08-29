package com.balaaca.booking.ports.outbound;

import com.balaaca.booking.domain.BookedSlot;
import com.balaaca.booking.domain.BookingSource;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.CustomerId;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
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

    /** Staff who could take this booking, most lightly loaded first. */
    List<StaffId> eligibleStaff(ServiceOfferingId serviceOfferingId);

    /** Upserts on (provider_id, phone_e164) without overwriting the provider's own edits. */
    CustomerId upsertCustomer(CustomerContact contact);

    record NewAppointment(
            AppointmentId id,
            StaffId staffId,
            BookableOffering offering,
            BookedSlot slot,
            CustomerId customerId,
            BookingSource source,
            Optional<String> idempotencyKey,
            Optional<String> idempotencyRequestHash) {
    }

    record InsertOutcome(AppointmentId appointmentId, boolean replayed) {
    }
}
