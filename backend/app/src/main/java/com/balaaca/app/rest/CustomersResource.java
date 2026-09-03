package com.balaaca.app.rest;

import com.balaaca.app.api.ClienteleApi;
import com.balaaca.app.api.model.AppointmentStatus;
import com.balaaca.app.api.model.CustomerBlockingRequest;
import com.balaaca.app.api.model.CustomerDetailView;
import com.balaaca.app.api.model.CustomerNotesRequest;
import com.balaaca.app.api.model.CustomerPage;
import com.balaaca.app.api.model.CustomerSummaryView;
import com.balaaca.app.api.model.CustomerVisitView;
import com.balaaca.booking.ports.inbound.ListCustomersUseCase;
import com.balaaca.booking.ports.inbound.ListCustomersUseCase.CustomerDetail;
import com.balaaca.booking.ports.inbound.ListCustomersUseCase.CustomerSummary;
import com.balaaca.platformkernel.tenancy.TenantBound;
import com.balaaca.sharedkernel.ids.CustomerId;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

/**
 * The provider's own address book.
 *
 * <p>Nothing here names a provider and there is no public read on this table at
 * all: a directory that hands out every provider's customer list is a marketing
 * database with a booking form attached.
 */
@Authenticated
@TenantBound
public class CustomersResource implements ClienteleApi {

    private final ListCustomersUseCase customers;

    public CustomersResource(ListCustomersUseCase customers) {
        this.customers = customers;
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response listCustomers(String q, String cursor, Integer limit) {
        var page = customers.list(
                Optional.ofNullable(q).filter(v -> !v.isBlank()),
                Cursors.rawId(cursor).map(CustomerId::of),
                limit == null ? Cursors.DEFAULT_LIMIT : limit);

        return Response.ok(new CustomerPage()
                .data(page.entries().stream().map(CustomersResource::summary).toList())
                .nextCursor(page.next().map(id -> Cursors.encodeRawId(id.value()))
                        .orElse(null)))
                // Never cached, anywhere between here and the browser. This is
                // a list of named people with their telephone numbers.
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response getCustomer(UUID id) {
        return Response.ok(detail(customers.detail(CustomerId.of(id))))
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response replaceCustomerNotes(UUID id, CustomerNotesRequest request) {
        // An absent body and an empty string mean the same thing, and it is the
        // meaningful one: the provider cleared the note.
        Optional<String> notes = Optional.ofNullable(request)
                .map(CustomerNotesRequest::getNotes)
                .map(String::trim).filter(n -> !n.isEmpty());

        return Response.ok(detail(customers.replaceNotes(CustomerId.of(id), notes)))
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response replaceCustomerBlocking(UUID id, CustomerBlockingRequest request) {
        // Required by the contract, so an absent flag is a malformed body rather
        // than a default: either reading of it would be a provider's decision
        // taken for them, and the two readings are opposites.
        return Response.ok(detail(customers.setBlocked(
                        CustomerId.of(id), request.getBlocked())))
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    private static CustomerSummaryView summary(CustomerSummary c) {
        return fill(new CustomerSummaryView(), c.id().value(), c.contact().fullName(),
                    c.contact().phone().e164(), c.contact().email(),
                    c.visits(), c.lastVisit());
    }

    private static CustomerDetailView detail(CustomerDetail c) {
        CustomerDetailView view = new CustomerDetailView();
        fillDetail(view, c);
        return view;
    }

    private static void fillDetail(CustomerDetailView view, CustomerDetail c) {
        view.customerId(c.id().value())
                .fullName(c.contact().fullName())
                .phone(c.contact().phone().e164())
                .blocked(c.blocked())
                .visits(c.visits())
                .history(c.history().stream()
                        .map(v -> new CustomerVisitView()
                                .startsAt(OffsetDateTime.ofInstant(v.startsAt(), ZoneOffset.UTC))
                                .serviceName(v.serviceName())
                                .status(AppointmentStatus.fromValue(v.status()))
                                .staffName(v.staffName()))
                        .toList());

        c.contact().email().ifPresent(view::setEmail);
        c.notes().ifPresent(view::setNotes);
        c.lastVisit().ifPresent(at ->
                view.setLastVisit(OffsetDateTime.ofInstant(at, ZoneOffset.UTC)));
    }

    private static CustomerSummaryView fill(CustomerSummaryView view, UUID id,
                                            String name, String phone,
                                            Optional<String> email, int visits,
                                            Optional<java.time.Instant> lastVisit) {
        view.customerId(id).fullName(name).phone(phone).visits(visits);
        email.ifPresent(view::setEmail);
        lastVisit.ifPresent(at ->
                view.setLastVisit(OffsetDateTime.ofInstant(at, ZoneOffset.UTC)));
        return view;
    }
}
