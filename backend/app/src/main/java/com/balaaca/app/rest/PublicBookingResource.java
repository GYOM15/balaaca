package com.balaaca.app.rest;

import com.balaaca.app.api.BookingApi;
import com.balaaca.app.api.model.ErrorCode;
import com.balaaca.app.api.model.ReportRequest;
import com.balaaca.app.api.model.AppointmentCreatedView;
import com.balaaca.app.api.model.AppointmentStatus;
import com.balaaca.app.api.model.BookAppointmentRequest;
import com.balaaca.app.api.model.CancelAppointmentRequest;
import com.balaaca.app.api.model.RescheduleBookingRequest;
import com.balaaca.app.api.model.CustomerBookingView;
import com.balaaca.app.api.model.Money;
import com.balaaca.booking.domain.BookingSource;
import com.balaaca.booking.ports.inbound.BookAppointmentUseCase;
import com.balaaca.providers.ports.inbound.LookupNoticeProfileUseCase;
import com.balaaca.providers.ports.inbound.ReportProviderUseCase;
import com.balaaca.booking.ports.inbound.CustomerBookingUseCase;
import com.balaaca.booking.ports.inbound.CustomerBookingUseCase.CustomerBooking;
import com.balaaca.booking.ports.inbound.GuardBookingReferenceUseCase;
import com.balaaca.booking.ports.inbound.GuardBookingReferenceUseCase.Verdict;
import com.balaaca.platformkernel.tenancy.PublicTenantBinder;
import com.balaaca.sharedkernel.error.DomainException;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.net.SocketAddress;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Function;

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
 * It parses nothing and decides nothing, and exceptions travel to the single
 * {@link DomainExceptionMapper}, which is the only place that knows what a
 * client may see.
 *
 * <p>The four routes that take a booking reference are the exception, and the
 * reason is that the reference is a capability short enough to be guessed. They
 * carry the budget that makes guessing expensive, which has to be asked before
 * the lookup and charged after it - so this class does catch, once, to tell a
 * reference that named nothing from one that worked.
 */
public class PublicBookingResource implements BookingApi {

    private final PublicTenantBinder tenants;
    private final BookAppointmentRequestMapper mapper;
    private final BookAppointmentUseCase booking;
    private final CustomerBookingUseCase bookings;
    private final LookupNoticeProfileUseCase providers;
    private final ReportProviderUseCase reports;
    private final GuardBookingReferenceUseCase guard;
    private final HttpServerRequest httpRequest;

    public PublicBookingResource(PublicTenantBinder tenants,
                                 BookAppointmentRequestMapper mapper,
                                 BookAppointmentUseCase booking,
                                 CustomerBookingUseCase bookings,
                                 LookupNoticeProfileUseCase providers,
                                 ReportProviderUseCase reports,
                                 GuardBookingReferenceUseCase guard,
                                 // Request-scoped and injected as a proxy, so
                                 // this singleton reads the request being served
                                 // rather than one it was built with.
                                 HttpServerRequest httpRequest) {
        this.tenants = tenants;
        this.mapper = mapper;
        this.booking = booking;
        this.bookings = bookings;
        this.providers = providers;
        this.reports = reports;
        this.guard = guard;
        this.httpRequest = httpRequest;
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
        return byReference(reference, r -> withBooking(r,
                () -> Response.ok(view(bookings.byReference(r)))
                        .header("Cache-Control", PublicCaching.NEVER)
                        .build()));
    }

    @Override
    public Response cancelBooking(String reference, CancelAppointmentRequest body) {
        return byReference(reference, r -> withBooking(r, () -> Response.ok(view(bookings.cancel(
                r,
                Optional.ofNullable(body).map(CancelAppointmentRequest::getReason)))).build()));
    }

    @Override
    public Response rescheduleBooking(String reference, RescheduleBookingRequest body) {
        return byReference(reference, r -> withBooking(r, () -> Response.ok(view(bookings.reschedule(
                r,
                // The contract says date-time, so the wire type carries an
                // offset; the domain carries an instant, and this is the one
                // place the two meet.
                body.getStartsAt().toInstant()))).build()));
    }

    /**
     * The budget every route that takes a reference is subject to.
     *
     * <p>Asked BEFORE the lookup, so a caller who has spent it is refused
     * whatever they are holding - a real reference included. If a spent budget
     * still answered 200 for a reference that exists and 429 for one that does
     * not, the refusal would be the oracle it exists to close.
     *
     * <p>Charged AFTER, and only on a 404, which is the single way any of these
     * routes says the reference named nothing. A customer opening their own
     * booking twenty times spends nothing, which is what lets one caller
     * identity stand for many people - and it does today, because the front end
     * calls this API from its own server.
     */
    private Response byReference(String reference, Function<String, Response> work) {
        String caller = caller();
        Verdict verdict = guard.mayTry(caller);
        if (!verdict.allowed()) {
            return refused(verdict);
        }
        try {
            return work.apply(canonical(reference));
        } catch (DomainException e) {
            if (e.status() == 404) {
                guard.referenceWasWrong(caller);
            }
            throw e;
        }
    }

    /**
     * Who is asking, as the network says rather than as a header claims.
     *
     * <p>A header the caller writes is a key the caller chooses, and a limit
     * keyed on a value an attacker picks per request is not a limit. Honouring a
     * forwarded address is therefore a deployment decision, made in
     * configuration by whoever owns the proxy
     * ({@code quarkus.http.proxy.proxy-address-forwarding} and its trusted-proxy
     * list), and never a decision taken here.
     *
     * <p>Until the front end forwards it and that configuration is set, every
     * customer arrives from one address - the BFF's - and shares one budget.
     * That is survivable only because a reference that works costs nothing: what
     * a guesser can take from the people behind them is the right to mistype,
     * for ten minutes, and not the right to open their booking.
     */
    private String caller() {
        SocketAddress address = httpRequest.remoteAddress();
        if (address == null) {
            return "unknown";
        }
        return address.hostAddress() != null ? address.hostAddress() : address.host();
    }

    /**
     * Case and the hyphen, and deliberately nothing else.
     *
     * <p>The rest of the tolerance the contract publishes - 0 read as O, 1 and L
     * read as I - is a FOLD, and a fold cannot be applied to one side of a
     * comparison. The initials are the business's real ones and may genuinely
     * contain I, L or O, so folding what a customer typed would move a correct
     * reference away from its own row. The database applies it to both sides,
     * and that is where it stays.
     *
     * <p>Upper-casing is safe in a way the fold is not: every stored reference is
     * upper case by CHECK constraint, so it can only ever move an input onto its
     * row. ROOT rather than the default locale, because in a Turkish one
     * upper-casing an i produces a character this alphabet does not have.
     */
    private static String canonical(String reference) {
        String upper = reference.toUpperCase(Locale.ROOT);
        // The contract accepts the hyphen as optional; the column stores it.
        return upper.length() == 9 ? upper.substring(0, 3) + "-" + upper.substring(3) : upper;
    }

    /**
     * The one error body this class builds, and the exception is deliberate.
     *
     * <p>{@link DomainExceptionMapper} is the single place an exception becomes a
     * response, and it cannot carry a header. This is the only refusal in the
     * product that has to publish {@code Retry-After}, so the choice was one
     * response built here or a general header mechanism in the file every error
     * in the system passes through. The body is still {@link Problems#of},
     * so what a client parses is the same shape as everything else.
     */
    private static Response refused(Verdict verdict) {
        return Response.status(429)
                .type("application/problem+json")
                .header("Retry-After", verdict.retryAfter().toSeconds())
                .header("Cache-Control", PublicCaching.NEVER)
                .entity(Problems.of(ErrorCode.RATE_LIMITED, 429,
                                    "Too many attempts, please try again later",
                                    TraceId.current()))
                .build();
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

    /**
     * 202 and not 201, deliberately: nothing is created that the customer can
     * then go and read. A report is not theirs to poll, and returning an
     * identifier would invite a client to try.
     *
     * <p>No tenant is bound and none is wanted. The reference resolves the
     * provider inside the database function, so a caller never learns whether a
     * reference exists by any route other than using it.
     */
    @Override
    public Response reportProvider(String reference, ReportRequest body) {
        return byReference(reference, r -> {
            reports.report(r, body.getReason().name(),
                           Optional.ofNullable(body.getDetails())
                                   .map(String::trim).filter(d -> !d.isEmpty()));

            return Response.status(202).header("Cache-Control", PublicCaching.NEVER).build();
        });
    }

}
