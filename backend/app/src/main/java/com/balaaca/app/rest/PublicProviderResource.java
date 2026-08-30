package com.balaaca.app.rest;

import com.balaaca.app.api.DiscoveryApi;
import com.balaaca.app.api.model.Money;
import com.balaaca.app.api.model.PublicOpeningHours;
import com.balaaca.app.api.model.PublicOpeningHoursSegment;
import com.balaaca.app.api.model.PublicProviderView;
import com.balaaca.app.api.model.PublicServiceOffering;
import com.balaaca.catalog.ports.inbound.PublishedCatalogueUseCase;
import com.balaaca.catalog.ports.inbound.PublishedCatalogueUseCase.PublishedService;
import com.balaaca.platformkernel.tenancy.PublicTenantBinder;
import com.balaaca.app.api.model.ProviderSummary;
import com.balaaca.app.api.model.ProviderSummaryPage;
import com.balaaca.providers.ports.inbound.LookupPublicProviderUseCase;
import com.balaaca.providers.ports.inbound.LookupPublicProviderUseCase.PublicProvider;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.ProviderCard;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.Query;
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
    private final SearchProvidersUseCase directory;
    private final PublishedCatalogueUseCase catalogue;
    private final ManageAvailabilityUseCase availability;

    public PublicProviderResource(PublicTenantBinder tenants,
                                  LookupPublicProviderUseCase providers,
                                  SearchProvidersUseCase directory,
                                  PublishedCatalogueUseCase catalogue,
                                  ManageAvailabilityUseCase availability) {
        this.tenants = tenants;
        this.providers = providers;
        this.directory = directory;
        this.catalogue = catalogue;
        this.availability = availability;
    }

    /**
     * The hub. No tenant is bound and none is wanted: this is the one public
     * read that spans providers, and what makes it safe is the database's own
     * public-read policy, which admits published rows to an unbound connection
     * and nothing else.
     */
    @Override
    public Response listProviders(String q, String categorySlug, String city,
                                  String cursor, Integer limit) {
        var found = directory.search(new Query(
                Optional.ofNullable(q).filter(v -> !v.isBlank()),
                Optional.ofNullable(categorySlug).filter(v -> !v.isBlank()),
                Optional.ofNullable(city).filter(v -> !v.isBlank()),
                Cursors.directoryPosition(cursor),
                limit == null ? Cursors.DEFAULT_LIMIT : limit));

        return Response.ok(new ProviderSummaryPage()
                .data(found.cards().stream().map(PublicProviderResource::card).toList())
                .nextCursor(found.next().map(Cursors::encodeDirectory).orElse(null)))
                .build();
    }

    private static ProviderSummary card(ProviderCard found) {
        ProviderSummary summary = new ProviderSummary()
                .slug(found.slug())
                .businessName(found.businessName());

        found.description().ifPresent(summary::setDescription);
        found.categorySlug().ifPresent(summary::setCategorySlug);
        found.city().ifPresent(summary::setCity);
        found.logoUrl().ifPresent(summary::setLogoUrl);
        return summary;
    }

    @Override
    public Response getPublicProvider(String slug) {
        tenants.bindPublished(slug);
        try {
            return Response.ok(view(providers.publicPage(), catalogue.published())).build();
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
                            .toList())).build();
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
        provider.logoUrl().ifPresent(view::setLogoUrl);
        provider.coverUrl().ifPresent(view::setCoverUrl);
        provider.publicPhoneE164().ifPresent(view::setPublicPhoneE164);
        provider.whatsappPhoneE164().ifPresent(view::setWhatsappPhoneE164);
        return view;
    }

    private static PublicServiceOffering service(PublishedService published) {
        PublicServiceOffering service = new PublicServiceOffering()
                .serviceOfferingId(published.id().value())
                .name(published.name())
                .durationMinutes((int) published.duration().toMinutes());

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
