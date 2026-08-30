package com.balaaca.app.rest;

import com.balaaca.app.api.OnboardingApi;
import com.balaaca.app.api.model.ProviderRegisteredView;
import com.balaaca.app.api.model.RegisterProviderRequest;
import com.balaaca.platformkernel.tenancy.AuthenticatedSubject;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase.Account;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase.Registration;
import io.quarkus.security.Authenticated;
import jakarta.ws.rs.core.Response;
import java.time.ZoneId;
import java.util.Optional;

/**
 * Signing a business up.
 *
 * <p>{@code @Authenticated} and deliberately NOT {@code @TenantBound}. Every
 * other authenticated resource resolves a tenant before it runs; this one is
 * what makes a tenant resolvable, and binding one first would refuse exactly the
 * callers it exists for - which is what a salon that has just signed up hits
 * everywhere else until this has run.
 *
 * <p>The account fields come from the verified token rather than the body. A
 * display name a caller typed would be the name on the audit trail, and an email
 * they typed would be an unverified address the platform would then write to.
 */
@Authenticated
public class ProviderRegistrationResource implements OnboardingApi {

    private final AuthenticatedSubject caller;
    private final RegisterProviderUseCase registration;

    public ProviderRegistrationResource(AuthenticatedSubject caller,
                                        RegisterProviderUseCase registration) {
        this.caller = caller;
        this.registration = registration;
    }

    @Override
    public Response registerProvider(RegisterProviderRequest request) {
        var registered = registration.register(new Registration(
                new Account(caller.require(), caller.displayName(), caller.email()),
                request.getSlug(),
                request.getBusinessName(),
                Optional.ofNullable(request.getCategorySlug()),
                Optional.ofNullable(request.getCity()),
                zone(request.getTimezone())));

        return Response.status(201)
                .entity(new ProviderRegisteredView()
                        .providerId(registered.id().value())
                        .slug(registered.slug())
                        .published(false))
                .build();
    }

    /**
     * Defaulted, never assumed: the product is not Guinea-only, and a zone the
     * client invented is refused here rather than stored and discovered months
     * later by a reminder that fired at the wrong hour.
     */
    private static ZoneId zone(String requested) {
        if (requested == null || requested.isBlank()) {
            return ZoneId.of("Africa/Conakry");
        }
        try {
            return ZoneId.of(requested);
        } catch (java.time.DateTimeException e) {
            throw new UnknownTimezoneException(requested);
        }
    }
}
