package com.balaaca.booking.ports.inbound;

import com.balaaca.booking.domain.BookingSource;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import java.time.Instant;
import java.util.Optional;

public interface BookAppointmentUseCase {

    BookingResult book(BookAppointmentCommand command);

    /**
     * The command speaks domain types, not the shapes a client happens to send.
     * An adapter parses and validates once at the edge and hands this in; from
     * here inward nothing has to re-check whether a phone number is normalised
     * or whether a uuid is the right kind of uuid.
     *
     * <p>The tenant is absent on purpose: it is ambient, resolved server-side
     * from the JWT subject or the published slug, and putting it here would move
     * the trust boundary into the caller.
     *
     * @param staffId empty lets the server choose an available staff member
     */
    record BookAppointmentCommand(
            ServiceOfferingId serviceOfferingId,
            Optional<StaffId> staffId,
            Instant startsAt,
            CustomerContact customer,
            Optional<Idempotency> idempotency,
            BookingSource source) {
    }

    /**
     * @param requestHash SHA-256 of the CLIENT's canonical body only. Hashing a
     *                    server-resolved value - the chosen staff member, the
     *                    upserted customer id - would make an honest retry
     *                    produce a different hash and fail as a reuse.
     */
    record Idempotency(String key, String requestHash) {
    }

    /** @param replayed true when an identical request had already created it */
    /**
     * @param reference what the customer keeps. The only thing that lets someone
     *                  without an account come back to this appointment, so it
     *                  is returned once, here, and travels on in the
     *                  confirmation message
     */
    record BookingResult(AppointmentId appointmentId, String reference, boolean replayed) {
    }
}
