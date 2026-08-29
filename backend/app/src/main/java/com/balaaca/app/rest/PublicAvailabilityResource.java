package com.balaaca.app.rest;

import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.catalog.ports.inbound.LookupServiceOfferingUseCase;
import com.balaaca.platformkernel.tenancy.PublicTenantBinder;
import com.balaaca.scheduling.ports.inbound.CalculateSlotsUseCase;
import com.balaaca.scheduling.ports.inbound.CalculateSlotsUseCase.SlotRequest;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What a customer can book, from a provider's public page.
 *
 * <p>Only bookable slots are returned. A uniform grid flagging which slots are
 * taken would publish a minute-by-minute occupancy map of a named person at a
 * named place, to unauthenticated callers, free to scrape - and it answers no
 * question this does not. Opening hours, if a client wants them for layout, are
 * a separate and far less revealing thing to publish.
 */
@Path("/v1/providers/{slug}/available-slots")
public class PublicAvailabilityResource {

    /** Bounded so one request cannot ask the calculator to walk a year. */
    private static final int MAX_DAYS = 31;

    private final PublicTenantBinder tenants;
    private final LookupServiceOfferingUseCase offerings;
    private final CalculateSlotsUseCase slots;

    public PublicAvailabilityResource(PublicTenantBinder tenants,
                                      LookupServiceOfferingUseCase offerings,
                                      CalculateSlotsUseCase slots) {
        this.tenants = tenants;
        this.offerings = offerings;
        this.slots = slots;
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public AvailableSlotsResponse list(@PathParam("slug") String slug,
                                       @QueryParam("service_offering_id") UUID serviceOfferingId,
                                       @QueryParam("staff_id") UUID staffId,
                                       @QueryParam("from") String from,
                                       @QueryParam("to") String to) {

        tenants.bindPublished(slug);
        try {
            BookableOffering offering =
                    offerings.requireBookable(ServiceOfferingId.of(serviceOfferingId));

            LocalDate fromDate = LocalDate.parse(from);
            LocalDate toDate = LocalDate.parse(to);
            if (toDate.isAfter(fromDate.plusDays(MAX_DAYS))) {
                toDate = fromDate.plusDays(MAX_DAYS);
            }

            var bookable = slots.bookable(new SlotRequest(
                    offering.id(),
                    Optional.ofNullable(staffId).map(StaffId::of),
                    fromDate, toDate,
                    offering.duration(), offering.bufferBefore(), offering.bufferAfter()));

            return new AvailableSlotsResponse(
                    bookable.stream().map(s -> new Slot(s.startsAt(), s.endsAt())).toList());
        } finally {
            tenants.clear();
        }
    }

    /**
     * No cursor: a bounded date range is already a page, and an opaque cursor
     * over a computed sequence would be a cursor over nothing stable.
     */
    public record AvailableSlotsResponse(List<Slot> data) {
    }

    public record Slot(java.time.Instant startsAt, java.time.Instant endsAt) {
    }
}
