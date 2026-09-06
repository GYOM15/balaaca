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
import com.balaaca.providers.ports.inbound.PublishedReviewsUseCase;
import com.balaaca.providers.ports.inbound.PublishedReviewsUseCase.PublishedReview;
import com.balaaca.app.api.model.ReviewPage;
import com.balaaca.app.api.model.ReviewSummary;
import com.balaaca.app.api.model.ReviewView;
import com.balaaca.app.api.model.CategoryFamily;
import com.balaaca.app.api.model.AreaList;
import com.balaaca.app.api.model.AreaView;
import com.balaaca.app.api.model.CategoryList;
import com.balaaca.app.api.model.CategoryView;
import com.balaaca.providers.ports.inbound.ListCategoriesUseCase;
import com.balaaca.providers.ports.inbound.ListLocalitiesUseCase;
import com.balaaca.platformkernel.media.ImageStore;
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

    /** Where a stored name becomes something a browser can fetch. */
    private final PublicTenantBinder tenants;
    private final LookupPublicProviderUseCase providers;
    private final LookupPublicStaffUseCase staff;
    private final PublishedCatalogueUseCase catalogue;
    private final ManageAvailabilityUseCase availability;
    /**
     * The store itself, not a context's port.
     *
     * <p>There was a LookupProviderImageUseCase in providers whose only
     * implementation was the filesystem store. Now that catalog publishes
     * images too, a read that belonged to one context would be the other's
     * dependency for no reason - so reading what was written sits where
     * writing does.
     */
    private final ImageStore images;
    private final ListCategoriesUseCase categories;
    private final ListLocalitiesUseCase localities;
    private final PublishedReviewsUseCase reviews;

    public PublicProviderResource(PublicTenantBinder tenants,
                                  LookupPublicProviderUseCase providers,
                                  LookupPublicStaffUseCase staff,
                                  PublishedCatalogueUseCase catalogue,
                                  ManageAvailabilityUseCase availability,
                                  ImageStore images,
                                  ListCategoriesUseCase categories,
                                  ListLocalitiesUseCase localities,
                                  PublishedReviewsUseCase reviews) {
        this.tenants = tenants;
        this.providers = providers;
        this.staff = staff;
        this.catalogue = catalogue;
        this.availability = availability;
        this.images = images;
        this.categories = categories;
        this.localities = localities;
        this.reviews = reviews;
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
                            .kind(LocalityView.KindEnum.fromString(l.kind()))
                            .providerCount(l.providerCount());
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
        // BEFORE the binding, and that is not an ordering accident. With a
        // tenant bound the policy that applies to reviews is the provider's own,
        // which admits the ones an operator took down - so an average read
        // there would count reviews the page does not show. The figure a
        // stranger sees has to be the average of what a stranger can read.
        //
        // It costs one indexed aggregate on a slug that turns out not to exist,
        // which is cheaper than clearing and rebinding around the read - and
        // rebinding in a finally would throw from a finally.
        var rating = reviews.ratingOf(slug);

        tenants.bindPublished(slug);
        try {
            return Response.ok(
                    PublicPage.view(providers.publicPage(), catalogue.published(), rating))
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
            return Response.ok(PublicPage.staff(staff.bookableStaff()))
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
            return Response.ok(PublicPage.hours(providers.publicPage().timezone().getId(),
                                               availability.combinedOpeningHours()))
                    .header("Cache-Control", PublicCaching.SLOW_MOVING)
                    .build();
        } finally {
            tenants.clear();
        }
    }

    /**
     * What customers said, as a stranger reads it.
     *
     * <p>No tenant is bound and none is wanted: the public-read policy admits
     * visible reviews of published, active businesses and nothing else, so this
     * route cannot see a takedown even by accident.
     */
    @Override
    public Response listProviderReviews(String slug, String cursor, Integer limit) {
        var page = reviews.page(slug, Cursors.rawId(cursor),
                                limit == null ? Cursors.DEFAULT_LIMIT : limit);

        return Response.ok(new ReviewPage()
                .data(page.reviews().stream().map(this::review).toList())
                .nextCursor(page.next().map(Cursors::encodeRawId).orElse(null)))
                .header("Cache-Control", PublicCaching.DIRECTORY)
                .build();
    }

    private ReviewView review(PublishedReview r) {
        ReviewView view = new ReviewView()
                .rating(r.rating())
                .serviceName(r.serviceName())
                // The month, exactly as the column holds it. Nothing here
                // truncates a date, because no date reached this far.
                .visitedMonth(r.visitedMonth().toString())
                // The stored name becomes a URL here and only here, the way it
                // does for every other image on this platform.
                .photoUrls(r.photoNames().stream().map(n -> PublicPage.MEDIA + n).toList());

        r.comment().ifPresent(view::setComment);
        // The one line on this page the business itself wrote, published under
        // the review rather than beside it.
        r.reply().ifPresent(view::setReply);
        return view;
    }

}
