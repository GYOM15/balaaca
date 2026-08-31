package com.balaaca.app.rest;

import com.balaaca.app.api.AgendaApi;
import com.balaaca.app.api.model.AppointmentCreatedView;
import com.balaaca.app.api.model.AppointmentCustomerView;
import com.balaaca.app.api.model.AppointmentPage;
import com.balaaca.app.api.model.AppointmentStatus;
import com.balaaca.app.api.model.AppointmentView;
import com.balaaca.app.api.model.Money;
import com.balaaca.app.api.model.CancelAppointmentRequest;
import com.balaaca.app.api.model.RescheduleAppointmentRequest;
import com.balaaca.app.api.model.BookAppointmentRequest;
import com.balaaca.booking.domain.BookingSource;
import com.balaaca.booking.ports.inbound.BookAppointmentUseCase;
import com.balaaca.booking.ports.inbound.CancelAppointmentUseCase;
import com.balaaca.providers.ports.inbound.LookupNoticeProfileUseCase;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase;
import com.balaaca.booking.ports.inbound.MoveAppointmentUseCase;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaQuery;
import com.balaaca.sharedkernel.ids.StaffId;
import com.balaaca.platformkernel.tenancy.TenantBound;
import com.balaaca.sharedkernel.ids.AppointmentId;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.core.Response;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

/**
 * The provider's own agenda.
 *
 * <p>The scopes the contract declares are enforced here, not merely documented:
 * the realm maps them onto roles, so an operation the caller was not granted is
 * refused before the tenant is even resolved.
 *
 * <p>Two annotations do the work, and the order between them is not arbitrary.
 * {@code @Authenticated} refuses a request with no verified token;
 * {@code @TenantBound} then resolves the subject to a provider through the
 * database and binds it, at a priority that runs before the transaction opens,
 * so every statement inside sees the tenant GUC.
 *
 * <p>Nothing in this signature names a provider, and that is the whole design:
 * the caller cannot ask for someone else's agenda because there is no field in
 * which to ask. Even if there were, the RLS policy on the table would return
 * nothing.
 */
@Authenticated
@TenantBound
public class AppointmentsResource implements AgendaApi {

    private final ListAppointmentsUseCase appointments;
    private final CancelAppointmentUseCase cancellation;
    private final MoveAppointmentUseCase moves;
    private final BookAppointmentRequestMapper mapper;
    private final BookAppointmentUseCase booking;
    private final LookupNoticeProfileUseCase providers;
    private final Clock clock;

    public AppointmentsResource(ListAppointmentsUseCase appointments,
                                CancelAppointmentUseCase cancellation,
                                MoveAppointmentUseCase moves,
                                BookAppointmentRequestMapper mapper,
                                BookAppointmentUseCase booking,
                                LookupNoticeProfileUseCase providers,
                                Clock clock) {
        this.appointments = appointments;
        this.cancellation = cancellation;
        this.moves = moves;
        this.mapper = mapper;
        this.booking = booking;
        this.providers = providers;
        this.clock = clock;
    }

    /**
     * The counter, not the public page.
     *
     * <p>The same request body and the same idempotency guarantee as a
     * customer's booking - a retry must not burn a second chair either way -
     * and one difference that is the whole point of the route: the source is
     * DASHBOARD, so the booking policy and the published hours do not apply.
     * They protect a customer and keep a stranger out; a provider writing in
     * their own diary is neither. {@code BookingSource} carries that decision,
     * so it is stated once and both routes read it rather than each deciding.
     */
    @Override
    @RolesAllowed("appointments:write")
    public Response bookWalkIn(String idempotencyKey, BookAppointmentRequest request) {
        var result = booking.book(mapper.toCommand(
                request, idempotencyKey,
                providers.currentNoticeProfile().countryCode(), BookingSource.DASHBOARD));

        return Response.status(result.replayed() ? 200 : 201)
                .entity(new AppointmentCreatedView()
                        .appointmentId(result.appointmentId().value())
                        .reference(result.reference())
                        .status(AppointmentStatus.fromValue(result.status().name())))
                .build();
    }

    @Override
    @RolesAllowed("appointments:write")
    public Response rescheduleAppointment(UUID id, RescheduleAppointmentRequest request) {
        return Response.ok(toView(moves.reschedule(
                AppointmentId.of(id),
                request.getStartsAt().toInstant(),
                // Absent leaves the appointment on its chair. Present is a real
                // move even at the same instant: the constraint keys on the
                // staff member, so this releases one resource and takes another.
                Optional.ofNullable(request.getStaffId()).map(StaffId::of)))).build();
    }

    @Override
    @RolesAllowed("appointments:write")
    public Response confirmAppointment(UUID id) {
        return Response.ok(toView(moves.confirm(AppointmentId.of(id)))).build();
    }

    @Override
    @RolesAllowed("appointments:write")
    public Response completeAppointment(UUID id) {
        return Response.ok(toView(moves.complete(AppointmentId.of(id)))).build();
    }

    @Override
    @RolesAllowed("appointments:write")
    public Response markAppointmentNoShow(UUID id) {
        return Response.ok(toView(moves.markNoShow(AppointmentId.of(id)))).build();
    }

    @Override
    @RolesAllowed("appointments:write")
    public Response cancelAppointment(UUID id, CancelAppointmentRequest request) {
        // A capability, not a status field: what the caller expresses is the
        // thing they want to happen, and the machine stays inside.
        AgendaEntry cancelled = cancellation.cancel(
                AppointmentId.of(id),
                Optional.ofNullable(request).map(CancelAppointmentRequest::getReason));

        return Response.ok(toView(cancelled)).build();
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response listAppointments(OffsetDateTime from, AppointmentStatus status,
                                     OffsetDateTime to, UUID staffId,
                                     String cursor, Integer limit) {
        var page = appointments.list(new AgendaQuery(
                // A provider opening their dashboard means "from now", not
                // "from the beginning of time": yesterday's bookings are a
                // different question and will be a different parameter.
                from == null ? clock.instant() : from.toInstant(),
                // Without a bound the agenda is a ray, and a day view reads
                // pages it throws away.
                Optional.ofNullable(to).map(OffsetDateTime::toInstant),
                Optional.ofNullable(staffId).map(StaffId::of),
                Optional.ofNullable(status).map(s -> toDomain(s)),
                Cursors.agendaPosition(cursor),
                limit == null ? Cursors.DEFAULT_LIMIT : limit));

        return Response.ok(new AppointmentPage()
                .data(page.entries().stream().map(AppointmentsResource::toView).toList())
                .nextCursor(page.next().map(Cursors::encodeAgenda).orElse(null)))
                .build();
    }

    private static com.balaaca.booking.domain.AppointmentStatus toDomain(AppointmentStatus wire) {
        // Both enums are closed and both are generated from the same two
        // sources - the contract and the column's CHECK - so a name that exists
        // on one side and not the other is a mistake the build should surface
        // rather than a case to fall through.
        return com.balaaca.booking.domain.AppointmentStatus.valueOf(wire.toString());
    }

    private static AppointmentView toView(AgendaEntry e) {
        AppointmentView view = new AppointmentView()
                .appointmentId(e.id().value())
                .startsAt(OffsetDateTime.ofInstant(e.startsAt(), ZoneOffset.UTC))
                .endsAt(OffsetDateTime.ofInstant(e.endsAt(), ZoneOffset.UTC))
                .status(AppointmentStatus.fromValue(e.status().name()))
                .serviceName(e.serviceName())
                .price(new Money()
                        .amountMinor(e.price().amountMinor())
                        .currency(e.price().currency().name()))
                .customer(new AppointmentCustomerView()
                        .fullName(e.customer().fullName())
                        .phone(e.customer().phone().e164()))
                // NOT NULL on every appointment, the resource key of the
                // constraint that stops double booking, and until now neither
                // returned nor filterable - so a salon with five chairs got one
                // undifferentiated stream and could not label a row.
                .staffId(e.staffId().value())
                .staffName(e.staffName());

        // The one screen this was ever for. It was accepted by the booking
        // request and discarded, so the box said "Message for the salon" and
        // the message went nowhere.
        e.customerNote().ifPresent(view::setCustomerNote);
        return view;
    }
}
