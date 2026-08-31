package com.balaaca.app.rest;

import com.balaaca.app.api.BookingApi;
import com.balaaca.app.api.model.AppointmentCreatedView;
import com.balaaca.app.api.model.AppointmentStatus;
import com.balaaca.app.api.model.BookAppointmentRequest;
import com.balaaca.app.api.model.CancelAppointmentRequest;
import com.balaaca.app.api.model.CustomerBookingView;
import com.balaaca.app.api.model.Money;
import com.balaaca.booking.domain.BookingSource;
import com.balaaca.booking.ports.inbound.BookAppointmentUseCase;
import com.balaaca.providers.ports.inbound.LookupNoticeProfileUseCase;
import com.balaaca.booking.ports.inbound.CustomerBookingUseCase;
import com.balaaca.booking.ports.inbound.CustomerBookingUseCase.CustomerBooking;
import com.balaaca.platformkernel.tenancy.PublicTenantBinder;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

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
    private final CustomerBookingUseCase bookings;
    private final LookupNoticeProfileUseCase providers;

    public PublicBookingResource(PublicTenantBinder tenants,
                                 BookAppointmentRequestMapper mapper,
                                 BookAppointmentUseCase booking,
                                 CustomerBookingUseCase bookings,
                                 LookupNoticeProfileUseCase providers) {
        this.tenants = tenants;
        this.mapper = mapper;
        this.booking = booking;
        this.bookings = bookings;
        this.providers = providers;
    }

    @Override
    public Response bookAppointment(String slug, String idempotencyKey,
                                    BookAppointmentRequest request) {
        // Resolves through a published-only lookup: an unknown slug and an
        // unpublished provider are the same 404.
        tenants.bindPublished(slug);
        try {
            // The provider's own country, not this platform's launch market.
            // "GN" stood here while providers.country_code existed and nothing
            // read it - against a product rule that says nothing may hardcode a
            // single market, and against PhoneNumber's own javadoc, which says
            // the region comes from the provider.
            var result = booking.book(mapper.toCommand(
                    request, idempotencyKey,
                    providers.currentNoticeProfile().countryCode(), BookingSource.PUBLIC));

            // A replay returns the original booking, not a second one.
            return Response.status(result.replayed() ? 200 : 201)
                    .entity(new AppointmentCreatedView()
                            .appointmentId(result.appointmentId().value())
                            .reference(result.reference())
                            // The provider's policy decides this, so the
                            // customer is told rather than left to assume.
                            .status(AppointmentStatus.fromValue(result.status().name())))
                    .build();
        } finally {
            tenants.clear();
        }
    }
    /**
     * The tenant is bound from the reference rather than a slug, and that is the
     * only difference from every other public route. A reference naming nothing
     * never binds, so the request stops here with the same 404 an unknown one
     * gets - and a booking at a business the platform suspended resolves to
     * nothing for the same reason a suspended page does.
     */
    @Override
    public Response getBooking(String reference) {
        return withBooking(reference, () -> Response.ok(view(bookings.byReference(reference)))
                .header("Cache-Control", PublicCaching.NEVER)
                .build());
    }

    @Override
    public Response cancelBooking(String reference, CancelAppointmentRequest request) {
        return withBooking(reference, () -> Response.ok(view(bookings.cancel(
                reference,
                Optional.ofNullable(request).map(CancelAppointmentRequest::getReason)))).build());
    }

    private Response withBooking(String reference, java.util.function.Supplier<Response> work) {
        tenants.bindBooking(reference);
        try {
            return work.get();
        } finally {
            tenants.clear();
        }
    }

    private static CustomerBookingView view(CustomerBooking booking) {
        CustomerBookingView view = new CustomerBookingView()
                .reference(booking.reference())
                .providerSlug(booking.providerSlug())
                .providerName(booking.providerName())
                .serviceName(booking.serviceName())
                .staffName(booking.staffName())
                .startsAt(OffsetDateTime.ofInstant(booking.startsAt(), ZoneOffset.UTC))
                .endsAt(OffsetDateTime.ofInstant(booking.endsAt(), ZoneOffset.UTC))
                .status(AppointmentStatus.fromValue(booking.status()))
                .timezone(booking.timezone())
                .price(new Money()
                        .amountMinor(booking.price().amountMinor())
                        .currency(booking.price().currency().name()));

        booking.readyBy().ifPresent(at ->
                view.setReadyBy(OffsetDateTime.ofInstant(at, ZoneOffset.UTC)));
        booking.readyAt().ifPresent(at ->
                view.setReadyAt(OffsetDateTime.ofInstant(at, ZoneOffset.UTC)));
        booking.cancellableUntil().ifPresent(until -> view.setCancellableUntil(
                OffsetDateTime.ofInstant(until, ZoneOffset.UTC)));
        return view;
    }

}
