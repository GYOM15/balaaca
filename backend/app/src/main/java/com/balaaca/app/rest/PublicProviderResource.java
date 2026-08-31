package com.balaaca.app.rest;

import com.balaaca.app.api.DiscoveryApi;
import com.balaaca.app.api.model.Money;
import com.balaaca.app.api.model.LocalityList;
import com.balaaca.app.api.model.LocalityView;
import com.balaaca.app.api.model.PublicOpeningHours;
import com.balaaca.app.api.model.PublicOpeningHoursSegment;
import com.balaaca.app.api.model.PublicProviderView;
import com.balaaca.app.api.model.Fulfilment;
import com.balaaca.app.api.model.PublicServiceOffering;
import com.balaaca.app.api.model.PublicStaffList;
import com.balaaca.app.api.model.PublicStaffMember;
import com.balaaca.catalog.ports.inbound.PublishedCatalogueUseCase;
import com.balaaca.catalog.ports.inbound.PublishedCatalogueUseCase.PublishedService;
import com.balaaca.platformkernel.tenancy.ProviderNotPublishedException;
import com.balaaca.platformkernel.tenancy.PublicTenantBinder;
import com.balaaca.providers.ports.inbound.LookupPublicProviderUseCase;
import com.balaaca.providers.ports.inbound.LookupPublicProviderUseCase.PublicProvider;
import com.balaaca.providers.ports.inbound.LookupPublicStaffUseCase;
import com.balaaca.app.api.model.CategoryFamily;
import com.balaaca.app.api.model.AreaList;
import com.balaaca.app.api.model.AreaView;
import com.balaaca.app.api.model.CategoryList;
import com.balaaca.app.api.model.CategoryView;
import com.balaaca.providers.ports.inbound.ListCategoriesUseCase;
import com.balaaca.providers.ports.inbound.ListLocalitiesUseCase;
import com.balaaca.providers.ports.inbound.LookupProviderImageUseCase;
import com.balaaca.scheduling.domain.OpenWindow;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.Optional;

/**
 * A provider's public page, and the hours to lay a grid over it.
 *
 * <p>The two operations together are the counterpart to bookable-slots-only
 * availability. A shop's hours are already public - they are on its door - so
 * publishing them costs nothing, while a uniform grid flagging which slots are
 * taken would be a minute-by-minute record of a named person at a named address,
 * served to anyone who can spell the slug.
 *
 * <p>Both resolve through a published-only lookup, so an unpublished provider
 * and a slug that was never taken are the same 404. This is the composition
 * root: the page is assembled here from what {@code providers} and
 * {@code catalog} each publish, so neither has to know the other exists.
 */
public class PublicProviderResource implements DiscoveryApi {

    private final PublicTenantBinder tenants;
    private final LookupPublicProviderUseCase providers;
    private final LookupPublicStaffUseCase staff;
    private final PublishedCatalogueUseCase catalogue;
    private final ManageAvailabilityUseCase availability;
    private final LookupProviderImageUseCase images;
    private final ListCategoriesUseCase categories;
    private final ListLocalitiesUseCase localities;

    public PublicProviderResource(PublicTenantBinder tenants,
                                  LookupPublicProviderUseCase providers,
                                  LookupPublicStaffUseCase staff,
                                  PublishedCatalogueUseCase catalogue,
                                  ManageAvailabilityUseCase availability,
                                  LookupProviderImageUseCase images,
                                  ListCategoriesUseCase categories,
                                  ListLocalitiesUseCase localities) {
        this.tenants = tenants;
        this.providers = providers;
        this.staff = staff;
        this.catalogue = catalogue;
        this.availability = availability;
        this.images = images;
        this.categories = categories;
        this.localities = localities;
    }

    /**
     * The taxonomy the hub browses by. No tenant, no cursor: the whole thing is
     * one page and always will be - a hub with two hundred trades is a hub
     * nobody can browse.
     */
    @Override
    public Response listCategories() {
        return Response.ok(new CategoryList().data(
                categories.offered().stream().map(c -> {
                    CategoryView view = new CategoryView()
                            .slug(c.slug())
                            .labelFr(c.labelFr())
                            // What lets a client show the trades that hold
                            // somebody and keep the rest behind "see all".
                            .providerCount(c.providerCount());
                    c.icon().ifPresent(view::setIcon);
                    c.family().ifPresent(f -> {
                        CategoryFamily family = new CategoryFamily()
                                .slug(f.slug()).labelFr(f.labelFr());
                        f.icon().ifPresent(family::setIcon);
                        view.setFamily(family);
                    });
                    return view;
                }).toList()))
                .header("Cache-Control", PublicCaching.TAXONOMY)
                .build();
    }

    /**
     * The map a business is filed against. No tenant, no cursor: fifty-one rows
     * is one page and a country does not paginate.
     */
    @Override
    public Response listLocalities() {
        return Response.ok(new LocalityList().data(
                localities.all().stream().map(l -> {
                    LocalityView view = new LocalityView()
                            .slug(l.slug())
                            .labelFr(l.labelFr())
                            .kind(LocalityView.KindEnum.fromString(l.kind()));
                    l.parentSlug().ifPresent(view::setParentSlug);
                    l.iso31662().ifPresent(view::setIso31662);
                    return view;
                }).toList()))
                .header("Cache-Control", PublicCaching.MAP)
                .build();
    }

    /**
     * The quartiers, which are not a taxonomy and are not cached like one.
     *
     * <p>This answer moves every time a provider publishes, and it is what the
     * registration form suggests from - so a minute of staleness is the most it
     * can carry without offering the tenth hairdresser in Nongo an empty list
     * the nine before them already filled.
     */
    @Override
    public Response listAreas(String q, String locality) {
        return Response.ok(new AreaList().data(
                localities.areas(trimmed(q), trimmed(locality)).stream()
                        .map(a -> new AreaView()
                                .label(a.label())
                                .providerCount(a.providerCount()))
                        .toList()))
                .header("Cache-Control", PublicCaching.DIRECTORY)
                .build();
    }

    /**
     * One derived value out of two stored ones. A CHECK on the table refuses an
     * offering that is both dropped off and travelled to, so these cannot
     * overlap - which is why this reads as a chain rather than a matrix.
     */
    private static Fulfilment fulfilmentOf(PublishedService s) {
        if (s.isCallOut()) {
            return Fulfilment.AT_CUSTOMER;
        }
        return s.isDropOff() ? Fulfilment.DROP_OFF : Fulfilment.ON_SITE;
    }

    /** A blank query parameter is an absent one, not a value to match on. */
    private static Optional<String> trimmed(String value) {
        return Optional.ofNullable(value).map(String::trim).filter(v -> !v.isEmpty());
    }

    /**
     * The bytes of an image a provider published. Public, because the page that
     * shows it is, and the name discloses nothing: it is minted by the store and
     * carries neither the provider nor the kind nor the original filename.
     */
    @Override
    public Response getMedia(String name) {
        return images.image(name)
                .map(image -> Response.ok(image.content())
                        .type(image.contentType())
                        // Immutable: replacing an image mints a new name, so a
                        // cached one can never be stale.
                        .header("Cache-Control", "public, max-age=31536000, immutable")
                        .build())
                .orElseThrow(() -> new ProviderNotPublishedException(name));
    }

    @Override
    public Response getPublicProvider(String slug) {
        tenants.bindPublished(slug);
        try {
            return Response.ok(view(providers.publicPage(), catalogue.published()))
                    .header("Cache-Control", PublicCaching.DIRECTORY)
                    .build();
        } finally {
            tenants.clear();
        }
    }

    /**
     * Who a customer may ask for by name. Without it the choice exists in the
     * booking request - listAvailableSlots and bookAppointment both take a
     * staff_id - and nowhere in the interface, because nothing told the customer
     * which names there are.
     */
    @Override
    public Response listPublicStaff(String slug) {
        tenants.bindPublished(slug);
        try {
            return Response.ok(new PublicStaffList()
                    .data(staff.bookableStaff().stream()
                            .map(m -> new PublicStaffMember()
                                    .staffId(m.id().value())
                                    .displayName(m.displayName()))
                            .toList()))
                    .header("Cache-Control", PublicCaching.SLOW_MOVING)
                    .build();
        } finally {
            tenants.clear();
        }
    }

    @Override
    public Response listPublicOpeningHours(String slug) {
        tenants.bindPublished(slug);
        try {
            return Response.ok(new PublicOpeningHours()
                    .timezone(providers.publicPage().timezone().getId())
                    .data(availability.combinedOpeningHours().stream()
                            .map(PublicProviderResource::segment)
                            .toList()))
                    .header("Cache-Control", PublicCaching.SLOW_MOVING)
                    .build();
        } finally {
            tenants.clear();
        }
    }

    private static PublicProviderView view(PublicProvider provider,
                                           List<PublishedService> services) {
        PublicProviderView view = new PublicProviderView()
                .slug(provider.slug())
                .businessName(provider.businessName())
                .timezone(provider.timezone().getId())
                .services(services.stream()
                        .map(PublicProviderResource::service)
                        .toList());

        provider.description().ifPresent(view::setDescription);
        provider.categorySlug().ifPresent(view::setCategorySlug);
        provider.city().ifPresent(view::setCity);
        provider.addressLine().ifPresent(view::setAddressLine);
        provider.latitude().ifPresent(view::setLatitude);
        provider.longitude().ifPresent(view::setLongitude);
        provider.logoUrl().ifPresent(name -> view.setLogoUrl(ProviderProfileResource.MEDIA + name));
        provider.coverUrl().ifPresent(name -> view.setCoverUrl(ProviderProfileResource.MEDIA + name));
        provider.publicPhoneE164().ifPresent(view::setPublicPhoneE164);
        provider.whatsappPhoneE164().ifPresent(view::setWhatsappPhoneE164);
        return view;
    }

    private static PublicServiceOffering service(PublishedService published) {
        PublicServiceOffering service = new PublicServiceOffering()
                .serviceOfferingId(published.id().value())
                .name(published.name())
                .durationMinutes((int) published.duration().toMinutes())
                .fulfilment(fulfilmentOf(published));

        // "Ready in 48 h" is what a customer needs before choosing. Without it
        // a drop-off reads as a ten-minute service, because ten minutes is what
        // the handover takes.
        published.turnaround().ifPresent(t -> service.setTurnaroundHours((int) t.toHours()));
        published.description().ifPresent(service::setDescription);
        // Absent, not zero: a hidden price rendered as 0 reads as free.
        published.price().ifPresent(price -> service.setPrice(new Money()
                .amountMinor(price.amountMinor())
                .currency(price.currency().name())));
        return service;
    }

    private static PublicOpeningHoursSegment segment(OpenWindow window) {
        return new PublicOpeningHoursSegment()
                .dayOfWeek(window.dayOfWeek())
                .startTime(window.start().toString())
                .endTime(window.end().toString());
    }
}
