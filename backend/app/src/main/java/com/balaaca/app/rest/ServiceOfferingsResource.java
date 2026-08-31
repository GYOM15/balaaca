package com.balaaca.app.rest;

import com.balaaca.app.api.CatalogueApi;
import com.balaaca.app.api.model.Money;
import com.balaaca.app.api.model.ServiceOfferingPage;
import com.balaaca.app.api.model.ServiceOfferingRequest;
import com.balaaca.app.api.model.Fulfilment;
import com.balaaca.app.api.model.ServiceOfferingView;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase.OfferingDefinition;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase.ServiceOffering;
import com.balaaca.platformkernel.tenancy.TenantBound;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Currency;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.core.Response;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

/**
 * The provider's own catalogue.
 *
 * <p>Nothing here names a provider. Another provider's service is not forbidden
 * but invisible, which is the same answer as a service that never existed - and
 * that is the point: any way to tell the two apart says whether a hidden service
 * exists.
 */
@Authenticated
@TenantBound
public class ServiceOfferingsResource implements CatalogueApi {

    private final ManageServiceOfferingsUseCase offerings;

    public ServiceOfferingsResource(ManageServiceOfferingsUseCase offerings) {
        this.offerings = offerings;
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response listServiceOfferings(Boolean active, String cursor, Integer limit) {
        var page = offerings.list(
                Optional.ofNullable(active),
                Cursors.serviceOfferingPosition(cursor),
                limit == null ? Cursors.DEFAULT_LIMIT : limit);

        return Response.ok(new ServiceOfferingPage()
                .data(page.entries().stream().map(ServiceOfferingsResource::toView).toList())
                .nextCursor(page.next().map(id -> Cursors.encodeRawId(id.value())).orElse(null)))
                .build();
    }

    @Override
    @RolesAllowed("catalog:write")
    public Response createServiceOffering(ServiceOfferingRequest request) {
        return Response.status(201).entity(toView(offerings.create(toDefinition(request)))).build();
    }

    @Override
    @RolesAllowed("catalog:write")
    public Response replaceServiceOffering(UUID id, ServiceOfferingRequest request) {
        return Response.ok(toView(offerings.replace(
                ServiceOfferingId.of(id), toDefinition(request)))).build();
    }

    /**
     * The wire defaults are applied here rather than left null. A generated
     * model carries the contract's default only when the client omitted the
     * field AND the generator chose to initialise it; relying on that would make
     * a buffer silently null the day the generator changes its mind.
     */
    private static OfferingDefinition toDefinition(ServiceOfferingRequest r) {
        return new OfferingDefinition(
                r.getName().trim(),
                Optional.ofNullable(r.getDescription()).filter(d -> !d.isBlank()),
                Duration.ofMinutes(r.getDurationMinutes()),
                Duration.ofMinutes(Optional.ofNullable(r.getBufferBeforeMinutes()).orElse(0)),
                Duration.ofMinutes(Optional.ofNullable(r.getBufferAfterMinutes()).orElse(0)),
                // Its presence is the whole discriminant. No fulfilment field is
                // accepted here: two sources of truth for one fact is one
                // source of truth fewer.
                Optional.ofNullable(r.getTurnaroundHours()).map(Duration::ofHours),
                com.balaaca.sharedkernel.money.Money.ofMinor(
                        r.getPrice().getAmountMinor(), Currency.of(r.getPrice().getCurrency())),
                Optional.ofNullable(r.getPriceVisible()).orElse(true),
                Optional.ofNullable(r.getSortOrder()).orElse(0),
                Optional.ofNullable(r.getActive()).orElse(true));
    }

    private static ServiceOfferingView toView(ServiceOffering o) {
        var d = o.definition();
        return new ServiceOfferingView()
                .serviceOfferingId(o.id().value())
                .name(d.name())
                .description(d.description().orElse(null))
                .durationMinutes((int) d.duration().toMinutes())
                .bufferBeforeMinutes((int) d.bufferBefore().toMinutes())
                .bufferAfterMinutes((int) d.bufferAfter().toMinutes())
                .price(new Money()
                        .amountMinor(d.price().amountMinor())
                        .currency(d.price().currency().name()))
                .turnaroundHours(d.turnaround().map(t -> (int) t.toHours()).orElse(null))
                // Derived, never accepted: a client must not have to branch on
                // the absence of a field to know which kind of service it is.
                .fulfilment(d.isDropOff() ? Fulfilment.DROP_OFF : Fulfilment.ON_SITE)
                .priceVisible(d.priceVisible())
                .sortOrder(d.sortOrder())
                .active(d.active());
    }
}
