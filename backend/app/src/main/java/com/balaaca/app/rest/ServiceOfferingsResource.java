package com.balaaca.app.rest;

import com.balaaca.app.api.CatalogueApi;
import com.balaaca.app.api.model.Money;
import com.balaaca.app.api.model.ServiceOfferingPage;
import com.balaaca.app.api.model.ServiceOfferingRequest;
import com.balaaca.app.api.model.Fulfilment;
import com.balaaca.app.api.model.ServiceOfferingView;
import com.balaaca.app.api.model.ServiceLocation;
import com.balaaca.app.api.model.PerformerList;
import com.balaaca.app.api.model.ServicePhotoList;
import com.balaaca.app.api.model.ServicePhotoView;
import com.balaaca.app.api.model.PerformerRequest;
import com.balaaca.catalog.ports.inbound.ManageServiceCompetenceUseCase;
import com.balaaca.catalog.ports.inbound.ManageServiceCompetenceUseCase.Performer;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase;
import com.balaaca.catalog.ports.inbound.ManageServicePhotosUseCase;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase.OfferingDefinition;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase.ServiceOffering;
import com.balaaca.platformkernel.tenancy.TenantBound;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import com.balaaca.sharedkernel.money.Currency;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.core.Response;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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

    /** Where a stored name becomes something a browser can fetch. */
    private static final String MEDIA = "/v1/media/";

    private final ManageServiceOfferingsUseCase offerings;
    private final ManageServiceCompetenceUseCase competences;
    private final ManageServicePhotosUseCase photos;

    public ServiceOfferingsResource(ManageServiceOfferingsUseCase offerings,
                                    ManageServiceCompetenceUseCase competences,
                                    ManageServicePhotosUseCase photos) {
        this.photos = photos;
        this.offerings = offerings;
        this.competences = competences;
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

    @Override
    @RolesAllowed("dashboard:read")
    public Response listServicePerformers(UUID id) {
        return Response.ok(performerList(
                competences.performers(ServiceOfferingId.of(id)))).build();
    }

    @Override
    @RolesAllowed("catalog:write")
    public Response replaceServicePerformers(UUID id, PerformerRequest request) {
        // An absent array and an empty one mean the same thing here, and it is
        // the meaningful one: nobody performs this service any more. The
        // contract requires the field, so this only covers a client that sent
        // null explicitly.
        List<StaffId> staff = Optional.ofNullable(request.getStaffIds())
                .orElseGet(List::of).stream().map(StaffId::of).toList();

        return Response.ok(performerList(
                competences.replacePerformers(ServiceOfferingId.of(id), staff))).build();
    }

    private static PerformerList performerList(List<Performer> performers) {
        return new PerformerList().data(performers.stream()
                .map(p -> new com.balaaca.app.api.model.Performer()
                        .staffId(p.staffId().value())
                        .displayName(p.displayName())
                        .bookable(p.bookable()))
                .toList());
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
                // The delay attached to the drop-off mode. Whether the two agree
                // is a rule about a service, so it is stated once, inward, where
                // every caller meets it.
                Optional.ofNullable(r.getTurnaroundHours()).map(Duration::ofHours),
                fulfilments(r),
                com.balaaca.sharedkernel.money.Money.ofMinor(
                        r.getPrice().getAmountMinor(), Currency.of(r.getPrice().getCurrency())),
                Optional.ofNullable(r.getPriceVisible()).orElse(true),
                Optional.ofNullable(r.getSortOrder()).orElse(0),
                Optional.ofNullable(r.getActive()).orElse(true));
    }

    /**
     * The modes the request published, in whichever of the two spellings it
     * used.
     *
     * <p>Translated here and judged inward: this method knows how a client
     * writes the set down, and nothing about what makes one legal. The
     * deprecated {@code location} becomes a set of one - which is all it could
     * ever name, and the reason it was superseded.
     */
    private static Set<com.balaaca.catalog.ports.inbound.Fulfilment>
            fulfilments(ServiceOfferingRequest r) {
        List<com.balaaca.catalog.ports.inbound.Fulfilment> stated =
                Optional.ofNullable(r.getFulfilments()).orElseGet(List::of).stream()
                        .map(f -> com.balaaca.catalog.ports.inbound.Fulfilment
                                .valueOf(f.name()))
                        // Not a set yet: a repeat is refused rather than
                        // absorbed, and only a list still carries the evidence.
                        .toList();

        return com.balaaca.catalog.ports.inbound.Fulfilment.published(
                stated,
                Optional.ofNullable(r.getLocation()).map(l -> l == ServiceLocation.AT_CUSTOMER),
                r.getTurnaroundHours() != null);
    }

    private static List<Fulfilment> wire(
            Set<com.balaaca.catalog.ports.inbound.Fulfilment> offered) {
        return offered.stream().map(f -> Fulfilment.valueOf(f.name())).toList();
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
                .fulfilments(wire(d.fulfilments()))
                // Deprecated and still required, so still answered. One value
                // standing for a set is not what the service is, which is why
                // the array beside it exists.
                .fulfilment(Fulfilment.valueOf(d.primaryFulfilment().name()))
                .priceVisible(d.priceVisible())
                .sortOrder(d.sortOrder())
                .active(d.active());
    }
    @Override
    @RolesAllowed("dashboard:read")
    public Response listServicePhotos(UUID id) {
        return Response.ok(photoList(photos.of(ServiceOfferingId.of(id)))).build();
    }

    @Override
    @RolesAllowed("catalog:write")
    public Response addServicePhoto(UUID id, java.io.File body) {
        return Response.status(201)
                .entity(photoList(photos.add(ServiceOfferingId.of(id), read(body))))
                .build();
    }

    @Override
    @RolesAllowed("catalog:write")
    public Response removeServicePhoto(UUID id, UUID photoId) {
        return Response.ok(photoList(photos.remove(ServiceOfferingId.of(id), photoId)))
                .build();
    }

    private static ServicePhotoList photoList(List<ManageServicePhotosUseCase.Photo> all) {
        return new ServicePhotoList().data(all.stream()
                .map(p -> new ServicePhotoView()
                        .photoId(p.id())
                        // The stored name becomes a URL here and only here. The
                        // database holds a name, so moving the images behind a
                        // CDN is a change to this line and to one adapter.
                        .url(MEDIA + p.name())
                        .position(p.position()))
                .toList());
    }

    /**
     * The generator hands a temporary file, because that is what the runtime
     * does with a binary body. Read once, into memory: the size is bounded far
     * below anything worth streaming, and everything downstream - magic bytes,
     * header, decode, resize, re-encode - needs the whole thing anyway.
     */
    private static byte[] read(java.io.File body) {
        if (body == null) {
            throw new UnreadableImageException();
        }
        try {
            return java.nio.file.Files.readAllBytes(body.toPath());
        } catch (java.io.IOException e) {
            throw new UnreadableImageException();
        }
    }

}
