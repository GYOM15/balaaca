package com.balaaca.app.rest;

import com.balaaca.app.api.BookingApi;
import com.balaaca.app.api.model.AppointmentCreatedView;
import com.balaaca.app.api.model.BookAppointmentRequest;
import com.balaaca.booking.domain.BookingSource;
import com.balaaca.booking.ports.inbound.BookAppointmentUseCase;
import com.balaaca.platformkernel.tenancy.PublicTenantBinder;
import jakarta.ws.rs.core.Response;

/**
 * Booking, from the provider's public page.
 *
 * <p>It implements {@link BookingApi}, which is generated from
 * META-INF/openapi.yaml. The path, the required header, the status codes and
 * the request shape are therefore not decided here at all - change the contract
 * and this class stops compiling, which is the only drift check the project
 * needs.
 *
 * <p>The slug carries the tenant here, unlike every authenticated route, which
 * carries no tenant identifier at all. That is not the IDOR the rule guards
 * against: the distinction is privilege, not identifier. A slug selects a public
 * storefront - the string printed on the QR code - while a provider id on an
 * agenda route would select someone else's private calendar. A customer is not
 * staff, so without this the booking route would answer 403 to everyone it
 * exists for.
 *
 * <p>The resource binds the tenant, delegates and maps the outcome to a status.
 * It parses nothing, decides nothing, and has no try/catch: exceptions travel to
 * the single {@link DomainExceptionMapper}, which is the only place that knows
 * what a client may see.
 */
public class PublicBookingResource implements BookingApi {

    private final PublicTenantBinder tenants;
    private final BookAppointmentRequestMapper mapper;
    private final BookAppointmentUseCase booking;

    public PublicBookingResource(PublicTenantBinder tenants,
                                 BookAppointmentRequestMapper mapper,
                                 BookAppointmentUseCase booking) {
        this.tenants = tenants;
        this.mapper = mapper;
        this.booking = booking;
    }

    @Override
    public Response bookAppointment(String slug, String idempotencyKey,
                                    BookAppointmentRequest request) {
        // Resolves through a published-only lookup: an unknown slug and an
        // unpublished provider are the same 404.
        tenants.bindPublished(slug);
        try {
            var result = booking.book(
                    mapper.toCommand(request, idempotencyKey, "GN", BookingSource.PUBLIC));

            // A replay returns the original booking, not a second one.
            return Response.status(result.replayed() ? 200 : 201)
                    .entity(new AppointmentCreatedView().appointmentId(result.appointmentId().value()))
                    .build();
        } finally {
            tenants.clear();
        }
    }
}
