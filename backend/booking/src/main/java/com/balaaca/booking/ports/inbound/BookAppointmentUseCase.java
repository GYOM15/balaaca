package com.balaaca.booking.ports.inbound;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookingSource;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.booking.domain.ServiceAddress;
import com.balaaca.catalog.ports.inbound.Fulfilment;
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
            /**
             * Which of the modes the service publishes the customer picked.
             *
             * <p>Empty is an answer, not an omission: a service published one
             * way asks nothing, and that is what every request sent before this
             * field existed means. Empty against a service published several
             * ways is refused - there is no defensible default between sitting
             * in a salon and having somebody come to your house.
             */
            Optional<Fulfilment> fulfilment,
            /**
             * Where to go. Present exactly when the CHOSEN mode is at-customer -
             * checked server-side rather than trusted, because the client cannot
             * be the one to decide whether an address is owed.
             */
            Optional<ServiceAddress> serviceAddress,
            Optional<String> customerNote,
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
     * @param status whether the salon is already expecting them or has yet to
     *               accept. The contract used to say PENDING and mean it for
     *               nobody: auto_confirm defaults to true, so most bookings
     *               arrive CONFIRMED and the customer was never told which
     * @param reference what the customer keeps. The only thing that lets someone
     *                  without an account come back to this appointment, so it
     *                  is returned once, here, and travels on in the
     *                  confirmation message
     */
    record BookingResult(AppointmentId appointmentId, String reference,
                         AppointmentStatus status, boolean replayed) {
    }
}
