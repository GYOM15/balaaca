package com.balaaca.app.rest;

import com.balaaca.app.api.model.BookAppointmentRequest;
import com.balaaca.booking.domain.BookingSource;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.ports.inbound.BookAppointmentUseCase.BookAppointmentCommand;
import com.balaaca.booking.ports.inbound.BookAppointmentUseCase.Idempotency;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import com.balaaca.sharedkernel.phone.PhoneNumber;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Optional;

/**
 * Turns what a client sent into domain objects.
 *
 * <p>This is the boundary the whole hexagon depends on: everything inward of it
 * speaks {@link ServiceOfferingId}, {@link PhoneNumber} and
 * {@link BookingSource}, so no service has to re-check whether a number is
 * normalised or whether a uuid is the right kind of uuid. Parsing happens once,
 * here, and a value that gets past it is valid by construction.
 *
 * <p>Keeping it out of the resource matters too: the resource then does nothing
 * but bind the tenant and delegate, and this class can be unit-tested without a
 * container.
 */
@ApplicationScoped
public class BookAppointmentRequestMapper {

    /**
     * @param defaultRegion the provider's country, used only when the caller
     *                      typed a local number. Never a hardcoded prefix: the
     *                      first provider in another market would have to undo it.
     */
    public BookAppointmentCommand toCommand(BookAppointmentRequest request,
                                            String idempotencyKey,
                                            String defaultRegion,
                                            BookingSource source) {
        return new BookAppointmentCommand(
                ServiceOfferingId.of(request.getServiceOfferingId()),
                Optional.ofNullable(request.getStaffId()).map(StaffId::of),
                // The contract says date-time, so the wire type carries an
                // offset. The domain carries an instant, and this is the one
                // place the two meet.
                request.getStartsAt().toInstant(),
                toContact(request, defaultRegion),
                toIdempotency(idempotencyKey, request),
                source);
    }

    private CustomerContact toContact(BookAppointmentRequest request, String defaultRegion) {
        return new CustomerContact(
                request.getCustomer().getFullName().trim(),
                PhoneNumber.parse(request.getCustomer().getPhone(), defaultRegion),
                Optional.ofNullable(request.getCustomer().getEmail()).filter(e -> !e.isBlank()));
    }

    /**
     * Always present: the contract declares the header required, so a request
     * that reached this method carries one. The Optional stays in the command
     * because the dashboard and the chatbot will book without a customer's
     * retry semantics.
     */
    private Optional<Idempotency> toIdempotency(String key, BookAppointmentRequest request) {
        return Optional.of(new Idempotency(key, RequestFingerprint.of(request)));
    }
}
