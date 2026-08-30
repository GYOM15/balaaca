package com.balaaca.app.rest;

import com.balaaca.app.api.AgendaApi;
import com.balaaca.app.api.model.AppointmentCustomerView;
import com.balaaca.app.api.model.AppointmentPage;
import com.balaaca.app.api.model.AppointmentStatus;
import com.balaaca.app.api.model.AppointmentView;
import com.balaaca.app.api.model.Money;
import com.balaaca.app.api.model.CancelAppointmentRequest;
import com.balaaca.booking.ports.inbound.CancelAppointmentUseCase;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaQuery;
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
    private final Clock clock;

    public AppointmentsResource(ListAppointmentsUseCase appointments,
                                CancelAppointmentUseCase cancellation,
                                Clock clock) {
        this.appointments = appointments;
        this.cancellation = cancellation;
        this.clock = clock;
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
                                     String cursor, Integer limit) {
        var page = appointments.list(new AgendaQuery(
                // A provider opening their dashboard means "from now", not
                // "from the beginning of time": yesterday's bookings are a
                // different question and will be a different parameter.
                from == null ? clock.instant() : from.toInstant(),
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
        return new AppointmentView()
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
                        .phone(e.customer().phone().e164()));
    }
}
