package com.balaaca.app.rest;

import com.balaaca.app.api.ProvidersApi;
import com.balaaca.app.api.model.ProviderRegisteredView;
import com.balaaca.app.api.model.ProviderSummary;
import com.balaaca.app.api.model.ProviderSummaryPage;
import com.balaaca.app.api.model.RegisterProviderRequest;
import com.balaaca.platformkernel.tenancy.AuthenticatedSubject;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase.Account;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase.Registration;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.ProviderCard;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.Query;
import io.quarkus.security.Authenticated;
import jakarta.ws.rs.core.Response;
import java.time.ZoneId;
import java.util.Optional;

/**
 * The provider collection: finding a business, and becoming one.
 *
 * <p>Two operations that could hardly be less alike sit in one class, and they
 * have to. A path is served by exactly one JAX-RS resource: split across two
 * classes, the router keeps one and answers 405 to the other - which is how
 * registration broke the day the directory was added, silently, until a test on
 * an unrelated path noticed.
 *
 * <p>So security is declared per method rather than on the class. Listing is
 * public. Registering is {@code @Authenticated} and deliberately NOT
 * {@code @TenantBound}: every other authenticated route resolves a tenant before
 * it runs, and this is what makes a tenant resolvable, so binding one first
 * would refuse exactly the callers it exists for.
 */
public class ProvidersResource implements ProvidersApi {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Africa/Conakry");

    private final AuthenticatedSubject caller;
    private final RegisterProviderUseCase registration;
    private final SearchProvidersUseCase directory;

    public ProvidersResource(AuthenticatedSubject caller,
                             RegisterProviderUseCase registration,
                             SearchProvidersUseCase directory) {
        this.caller = caller;
        this.registration = registration;
        this.directory = directory;
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
                .data(found.cards().stream().map(ProvidersResource::card).toList())
                .nextCursor(found.next().map(Cursors::encodeDirectory).orElse(null)))
                .build();
    }

    /**
     * The account fields come from the verified token rather than the body. A
     * display name a caller typed would be the name on the audit trail, and an
     * email they typed would be an unverified address the platform would write
     * to.
     */
    @Override
    @Authenticated
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

    /**
     * Defaulted, never assumed: the product is not Guinea-only, and a zone the
     * client invented is refused here rather than stored and discovered months
     * later by a reminder that fired at the wrong hour.
     */
    private static ZoneId zone(String requested) {
        if (requested == null || requested.isBlank()) {
            return DEFAULT_ZONE;
        }
        try {
            return ZoneId.of(requested);
        } catch (java.time.DateTimeException e) {
            throw new UnknownTimezoneException(requested);
        }
    }
}
