package com.balaaca.app.rest;

import com.balaaca.app.api.AvailabilityApi;
import com.balaaca.app.api.model.AvailableSlot;
import com.balaaca.app.api.model.AvailableSlotPage;
import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.catalog.ports.inbound.LookupServiceOfferingUseCase;
import com.balaaca.platformkernel.tenancy.PublicTenantBinder;
import com.balaaca.scheduling.ports.inbound.CalculateSlotsUseCase;
import com.balaaca.scheduling.ports.inbound.CalculateSlotsUseCase.SlotRequest;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.ws.rs.core.Response;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
 *
 * <p>Implements {@link AvailabilityApi}, generated from the contract.
 */
public class PublicAvailabilityResource implements AvailabilityApi {

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

    @Override
    public Response listAvailableSlots(String slug, UUID serviceOfferingId,
                                       LocalDate from, LocalDate to,
                                       UUID staffId, String cursor, Integer limit) {
        tenants.bindPublished(slug);
        try {
            BookableOffering offering =
                    offerings.requireBookable(ServiceOfferingId.of(serviceOfferingId));

            LocalDate toDate = to.isAfter(from.plusDays(MAX_DAYS)) ? from.plusDays(MAX_DAYS) : to;

            var bookable = slots.bookable(new SlotRequest(
                    offering.id(),
                    Optional.ofNullable(staffId).map(StaffId::of),
                    from, toDate,
                    offering.duration(), offering.bufferBefore(), offering.bufferAfter()));

            return Response.ok(page(bookable, cursor, limit)).build();
        } finally {
            tenants.clear();
        }
    }

    /**
     * Cuts the computed sequence into pages.
     *
     * <p>A cursor over a computed sequence is only meaningful because this one
     * is ordered and reproducible: the same request returns the same slots in
     * the same order, so a position in it is stable for as long as the
     * underlying availability is. The cursor is the next slot's own start, which
     * is a value the caller already has in the page it just read - it discloses
     * nothing, and it is not a row id or an offset into anything.
     */
    private static AvailableSlotPage page(List<com.balaaca.scheduling.domain.AvailableSlot> all,
                                          String cursor, Integer limit) {
        int size = limit == null ? Cursors.DEFAULT_LIMIT : limit;
        List<com.balaaca.scheduling.domain.AvailableSlot> after = Cursors.after(all, cursor);

        List<AvailableSlot> page = after.stream()
                .limit(size)
                .map(s -> new AvailableSlot()
                        .startsAt(OffsetDateTime.ofInstant(s.startsAt(), ZoneOffset.UTC))
                        .endsAt(OffsetDateTime.ofInstant(s.endsAt(), ZoneOffset.UTC)))
                .toList();

        String next = after.size() > page.size()
                ? Cursors.encode(after.get(page.size()).startsAt())
                : null;

        return new AvailableSlotPage().data(page).nextCursor(next);
    }
}
