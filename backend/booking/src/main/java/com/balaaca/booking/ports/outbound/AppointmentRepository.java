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
