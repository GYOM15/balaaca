package com.balaaca.app.rest;

import com.balaaca.app.api.ProfileApi;
import java.time.ZoneOffset;
import com.balaaca.providers.ports.inbound.ContestSuspensionUseCase;
import com.balaaca.app.api.model.ContestationView;
import com.balaaca.app.api.model.ContestationRequest;
import com.balaaca.app.api.model.BookingPolicyRequest;
import com.balaaca.app.api.model.BookingPolicyView;
import com.balaaca.app.api.model.LocalityRef;
import com.balaaca.app.api.model.ProviderProfileRequest;
import com.balaaca.app.api.model.ProviderProfileView;
import com.balaaca.app.api.model.ProviderStatus;
import com.balaaca.app.api.model.ReadinessView;
import com.balaaca.platformkernel.tenancy.TenantBound;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.BookingPolicy;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProfileEdit;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProviderProfile;
import com.balaaca.app.api.model.ProviderPreviewView;
import com.balaaca.app.api.model.ProviderReviewPage;
import com.balaaca.app.api.model.ProviderReviewView;
import com.balaaca.app.api.model.ReviewReplyRequest;
import com.balaaca.catalog.ports.inbound.PublishedCatalogueUseCase;
import com.balaaca.providers.ports.inbound.LookupPublicProviderUseCase;
import com.balaaca.providers.ports.inbound.LookupPublicStaffUseCase;
import com.balaaca.providers.ports.inbound.OwnReviewsUseCase;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.core.Response;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Optional;

/**
 * What a provider publishes about itself.
 *
 * <p>No provider identifier on either operation: the tenant is ambient. The slug
 * is returned and never accepted - it is the string on the QR code, and there is
 * no path through this resource that changes it.
 */
@Authenticated
@TenantBound
public class ProviderProfileResource implements ProfileApi {

    /** Where a stored name becomes something a browser can fetch. */
    static final String MEDIA = "/v1/media/";

    private final ManageProviderProfileUseCase profiles;
    private final PublicLink links;
    private final ContestSuspensionUseCase contestations;
    private final OwnReviewsUseCase reviews;
    /**
     * The four the public page is drawn from, so the preview is drawn from the
     * same four. A preview assembled out of this resource's OWN reads would be
     * a second source of truth for one page.
     */
    private final LookupPublicProviderUseCase publicPage;
    private final PublishedCatalogueUseCase catalogue;
    private final LookupPublicStaffUseCase staff;
    private final ManageAvailabilityUseCase availability;

    public ProviderProfileResource(ManageProviderProfileUseCase profiles,
                                   PublicLink links,
                                   ContestSuspensionUseCase contestations,
                                   OwnReviewsUseCase reviews,
                                   LookupPublicProviderUseCase publicPage,
                                   PublishedCatalogueUseCase catalogue,
                                   LookupPublicStaffUseCase staff,
                                   ManageAvailabilityUseCase availability) {
        this.contestations = contestations;
        this.links = links;
        this.profiles = profiles;
        this.reviews = reviews;
        this.publicPage = publicPage;
        this.catalogue = catalogue;
        this.staff = staff;
        this.availability = availability;
    }

    /**
     * The page as a customer will see it, published or not.
     *
     * <p>No tenant is bound here and none needs to be: this route is
     * authenticated, so the interceptor chain has already resolved the caller's
     * membership and bound their provider. That is the ONLY difference between
     * this and the public route - which resolves the same tenant from a slug,
     * through a lookup that refuses an unpublished business.
     *
     * <p>Reviews are not carried, and that is honest rather than lazy: what a
     * stranger can read of an unpublished business is nothing, so a preview
     * that invented an average would be previewing a different page.
     */
    @Override
    @RolesAllowed("dashboard:read")
    public Response previewOwnPage() {
        var provider = publicPage.publicPage();
        return Response.ok(new ProviderPreviewView()
                .provider(PublicPage.view(provider, catalogue.published(), Optional.empty()))
                .openingHours(PublicPage.hours(provider.timezone().getId(),
                                               availability.combinedOpeningHours()))
                .staff(PublicPage.staff(staff.bookableStaff()))
                .published(profiles.current().published()))
                // Never cached. A provider presses this to check a change they
                // made a moment ago, which is exactly the request a cache would
                // answer with the version before it.
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response listOwnReviews(String cursor, Integer limit) {
        var page = reviews.page(Cursors.rawId(cursor),
                                limit == null ? Cursors.DEFAULT_LIMIT : limit);

        return Response.ok(new ProviderReviewPage()
                .data(page.entries().stream()
                        .map(ProviderProfileResource::review).toList())
                .nextCursor(page.next().map(Cursors::encodeRawId).orElse(null)))
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    /**
     * The one write a business may make on a review of itself.
     *
     * <p>What keeps it to the reply is not this method. The role holds
     * {@code UPDATE (reply, replied_at)} and no other column, so a statement
     * that touched a rating would be refused by PostgreSQL before any policy
     * was consulted - which is the only kind of guarantee worth having about
     * whether a star can be bought back.
     */
    @Override
    @RolesAllowed("profile:write")
    public Response replyToReview(java.util.UUID id, ReviewReplyRequest body) {
        return Response.ok(review(reviews.reply(id, body.getReply())))
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    @Override
    @RolesAllowed("profile:write")
    public Response withdrawReviewReply(java.util.UUID id) {
        return Response.ok(review(reviews.withdrawReply(id)))
                .header("Cache-Control", PublicCaching.NEVER)
                .build();
    }

    private static ProviderReviewView review(OwnReviewsUseCase.OwnReview own) {
        ProviderReviewView view = new ProviderReviewView()
                .reviewId(own.id())
                .rating(own.rating())
                .serviceName(own.serviceName())
                // The month as the column holds it. No date reached this far.
                .visitedMonth(own.visitedMonth().toString())
                .status(ProviderReviewView.StatusEnum.fromValue(own.status()))
                .createdAt(own.createdAt().atOffset(java.time.ZoneOffset.UTC))
                // The stored name becomes a URL here and only here.
                .photoUrls(own.photoNames().stream().map(n -> MEDIA + n).toList());

        own.comment().ifPresent(view::setComment);
        own.reply().ifPresent(view::setReply);
        return view;
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response getProviderProfile() {
        return Response.ok(view(profiles.current())).build();
    }

    @Override
    @RolesAllowed("profile:write")
    public Response updateProviderProfile(ProviderProfileRequest request) {
        return Response.ok(view(profiles.replace(new ProfileEdit(
                request.getBusinessName(),
                Optional.ofNullable(request.getDescription()),
                Optional.ofNullable(request.getCategorySlug()),
                trimmed(request.getLocalitySlug()),
                trimmed(request.getArea()),
                Optional.ofNullable(request.getCity()),
                Optional.ofNullable(request.getAddressLine()),
                Optional.ofNullable(request.getPublicPhoneE164()),
                Optional.ofNullable(request.getPublicEmail()),
                Optional.ofNullable(request.getWhatsappPhoneE164()),
                zone(request.getTimezone()),
                Boolean.TRUE.equals(request.getPublished()))))).build();
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response getBookingPolicy() {
        return Response.ok(policyView(profiles.currentPolicy())).build();
    }

    @Override
    @RolesAllowed("profile:write")
    public Response replaceBookingPolicy(BookingPolicyRequest request) {
        return Response.ok(policyView(profiles.replacePolicy(new BookingPolicy(
                request.getSlotGranularityMinutes(),
                request.getMinLeadTimeMinutes(),
                request.getMaxAdvanceDays(),
                request.getCancellationDeadlineMinutes(),
                Boolean.TRUE.equals(request.getAutoConfirm()))))).build();
    }

    private static BookingPolicyView policyView(BookingPolicy policy) {
        return new BookingPolicyView()
                .slotGranularityMinutes(policy.slotGranularityMinutes())
                .minLeadTimeMinutes(policy.minLeadTimeMinutes())
                .maxAdvanceDays(policy.maxAdvanceDays())
                .cancellationDeadlineMinutes(policy.cancellationDeadlineMinutes())
                .autoConfirm(policy.autoConfirm());
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response getProviderQrCode() {
        String slug = profiles.current().slug();
        return Response.ok(links.qrCodeFor(slug))
                .type("image/svg+xml")
                // A day. It changes only if the slug changes, and the slug
                // cannot: it is printed on every card already handed out.
                .header("Cache-Control", "private, max-age=86400")
                .build();
    }

    @Override
    @RolesAllowed("profile:write")
    public Response replaceProviderLogo(java.io.File body) {
        return Response.ok(view(profiles.replaceLogo(read(body)))).build();
    }

    @Override
    @RolesAllowed("profile:write")
    public Response replaceProviderCover(java.io.File body) {
        return Response.ok(view(profiles.replaceCover(read(body)))).build();
    }

    /**
     * The generator hands a temporary file, because that is what the runtime
     * does with a binary body. Read once, into memory: the size is already
     * bounded far below anything worth streaming, and everything downstream -
     * magic bytes, header, decode, re-encode - needs the whole thing anyway.
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

    private ProviderProfileView view(ProviderProfile profile) {
        ProviderProfileView view = new ProviderProfileView()
                .slug(profile.slug())
                .businessName(profile.businessName())
                .timezone(profile.timezone().getId())
                .published(profile.published())
                .status(ProviderStatus.fromValue(profile.status().name()));

        profile.description().ifPresent(view::setDescription);
        profile.categorySlug().ifPresent(view::setCategorySlug);
        profile.locality().ifPresent(l -> view.setLocality(
                new LocalityRef().slug(l.slug()).labelFr(l.labelFr())));
        profile.area().ifPresent(view::setArea);
        profile.city().ifPresent(view::setCity);
        profile.addressLine().ifPresent(view::setAddressLine);
        profile.publicPhoneE164().ifPresent(view::setPublicPhoneE164);
        profile.publicEmail().ifPresent(view::setPublicEmail);
        profile.whatsappPhoneE164().ifPresent(view::setWhatsappPhoneE164);
        // The stored name becomes a URL here and only here. The database holds a
        // name, so moving the images behind a CDN is a change to this line and
        // to one adapter, not to every row.
        // The salon reads here why its own page vanished. Absent on every
        // business the platform has not acted against, which is all of them.
        profile.suspendedAt().ifPresent(at -> view.setSuspendedAt(
                java.time.OffsetDateTime.ofInstant(at, java.time.ZoneOffset.UTC)));
        profile.suspensionReason().ifPresent(view::setSuspensionReason);

        // Built here and only here, from the slug. The database stores a
        // handle; where that handle lives is a deployment fact.
        view.setPublicUrl(links.urlFor(profile.slug()));

        profile.logoUrl().ifPresent(name -> view.setLogoUrl(MEDIA + name));
        profile.coverUrl().ifPresent(name -> view.setCoverUrl(MEDIA + name));
        return view;
    }

    /**
     * A blank field clears the column rather than storing whitespace. The
     * quartier is free text and the one place a stray space would survive into
     * an index, a suggestion list and every card that shows it.
     */
    private static Optional<String> trimmed(String value) {
        return Optional.ofNullable(value).map(String::trim).filter(v -> !v.isEmpty());
    }

    private static ZoneId zone(String requested) {
        try {
            return ZoneId.of(requested);
        } catch (java.time.DateTimeException e) {
            throw new UnknownTimezoneException(requested);
        }
    }
    @Override
    @RolesAllowed("dashboard:read")
    public Response getContestation() {
        // 204 rather than an empty object: there is nothing to show, and a
        // shape full of nulls would make a client decide what that meant.
        return contestations.current()
                .map(c -> Response.ok(view(c)).build())
                .orElseGet(() -> Response.noContent().build());
    }

    @Override
    @RolesAllowed("profile:write")
    public Response contestSuspension(ContestationRequest request) {
        return Response.status(201)
                .entity(view(contestations.contest(request.getMessage())))
                .build();
    }

    private static ContestationView view(ContestSuspensionUseCase.Contestation c) {
        return new ContestationView()
                .message(c.message())
                .submittedAt(OffsetDateTime.ofInstant(c.submittedAt(), ZoneOffset.UTC))
                .aboutSuspensionAt(
                        OffsetDateTime.ofInstant(c.aboutSuspensionAt(), ZoneOffset.UTC))
                .read(c.read());
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response getReadiness() {
        var r = profiles.readiness();
        return Response.ok(new ReadinessView()
                .hasService(r.hasService())
                .hasHours(r.hasHours())
                .hasBookableStaff(r.hasBookableStaff())
                .canPublish(r.canPublish())
                .published(r.published()))
                .build();
    }

}
