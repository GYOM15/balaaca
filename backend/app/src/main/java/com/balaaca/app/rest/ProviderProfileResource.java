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
