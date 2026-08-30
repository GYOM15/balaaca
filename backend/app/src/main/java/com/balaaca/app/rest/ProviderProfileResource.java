package com.balaaca.app.rest;

import com.balaaca.app.api.ProfileApi;
import com.balaaca.app.api.model.ProviderProfileRequest;
import com.balaaca.app.api.model.ProviderProfileView;
import com.balaaca.app.api.model.ProviderStatus;
import com.balaaca.platformkernel.tenancy.TenantBound;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase;
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

    public ProviderProfileResource(ManageProviderProfileUseCase profiles) {
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
                Optional.ofNullable(request.getCity()),
                Optional.ofNullable(request.getAddressLine()),
                Optional.ofNullable(request.getPublicPhoneE164()),
                Optional.ofNullable(request.getPublicEmail()),
                Optional.ofNullable(request.getWhatsappPhoneE164()),
                zone(request.getTimezone()),
                Boolean.TRUE.equals(request.getPublished()))))).build();
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

    private static ProviderProfileView view(ProviderProfile profile) {
        ProviderProfileView view = new ProviderProfileView()
                .slug(profile.slug())
                .businessName(profile.businessName())
                .timezone(profile.timezone().getId())
                .published(profile.published())
                .status(ProviderStatus.fromValue(profile.status().name()));

        profile.description().ifPresent(view::setDescription);
        profile.categorySlug().ifPresent(view::setCategorySlug);
        profile.city().ifPresent(view::setCity);
        profile.addressLine().ifPresent(view::setAddressLine);
        profile.publicPhoneE164().ifPresent(view::setPublicPhoneE164);
        profile.publicEmail().ifPresent(view::setPublicEmail);
        profile.whatsappPhoneE164().ifPresent(view::setWhatsappPhoneE164);
        // The stored name becomes a URL here and only here. The database holds a
        // name, so moving the images behind a CDN is a change to this line and
        // to one adapter, not to every row.
        profile.logoUrl().ifPresent(name -> view.setLogoUrl(MEDIA + name));
        profile.coverUrl().ifPresent(name -> view.setCoverUrl(MEDIA + name));
        return view;
    }

    private static ZoneId zone(String requested) {
        try {
            return ZoneId.of(requested);
        } catch (java.time.DateTimeException e) {
            throw new UnknownTimezoneException(requested);
        }
    }
}
