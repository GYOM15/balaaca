package com.balaaca.app.rest;

import com.balaaca.app.api.ProfileApi;
import com.balaaca.app.api.model.BookingPolicyRequest;
import com.balaaca.app.api.model.BookingPolicyView;
import com.balaaca.app.api.model.LocalityRef;
import com.balaaca.app.api.model.ProviderProfileRequest;
import com.balaaca.app.api.model.ProviderProfileView;
import com.balaaca.app.api.model.ProviderStatus;
import com.balaaca.platformkernel.tenancy.TenantBound;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.BookingPolicy;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProfileEdit;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProviderProfile;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.core.Response;
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

    public ProviderProfileResource(ManageProviderProfileUseCase profiles,
                                   PublicLink links) {
        this.links = links;
        this.profiles = profiles;
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
}
