package com.balaaca.providers.application;

import com.balaaca.catalog.ports.inbound.PublishedCatalogueUseCase;
import com.balaaca.providers.domain.NothingToPublishException;
import com.balaaca.providers.domain.UnknownCategoryException;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase;
import com.balaaca.providers.ports.outbound.ProviderProfileRepository;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.providers.ports.outbound.ProviderRegistrationRepository;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.Optional;
import java.util.UUID;

/**
 * The provider's own page, read and written.
 *
 * <p>Publishing is the one part of this that is a rule rather than a store. A
 * page goes on the public booking path only when there is something to book:
 * a customer who finds an empty calendar does not come back, and the provider
 * who published it has no way to know that happened.
 *
 * <p>The two readiness questions are asked of the modules that own the answers,
 * through their inbound ports and in this same transaction. Reading
 * {@code service_offerings} from here would put the definition of "an active
 * service" in two places, and the second one would drift.
 */
@ApplicationScoped
public class ManageProviderProfileService implements ManageProviderProfileUseCase {

    private final ProviderProfileRepository profiles;
    private final ProviderRegistrationRepository categories;
    private final PublishedCatalogueUseCase catalogue;
    private final ManageAvailabilityUseCase availability;
    private final TenantContext tenant;

    public ManageProviderProfileService(ProviderProfileRepository profiles,
                                        ProviderRegistrationRepository categories,
                                        PublishedCatalogueUseCase catalogue,
                                        ManageAvailabilityUseCase availability,
                                        TenantContext tenant) {
        this.profiles = profiles;
        this.categories = categories;
        this.catalogue = catalogue;
        this.availability = availability;
        this.tenant = tenant;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ProviderProfile current() {
        return profiles.current();
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ProviderProfile replace(ProfileEdit edit) {
        // The public page, the contact details and whether the business is
        // reachable at all. An employee editing their own hours is ordinary;
        // an employee unpublishing the storefront is not.
        tenant.requireOwner("update_provider_profile");
        if (edit.published()) {
            requireSomethingBookable();
        }
        Optional<UUID> categoryId = edit.categorySlug().map(this::requireCategory);
        return profiles.update(edit, categoryId);
    }

    /**
     * Checked on the way in rather than after the write, so a refusal leaves the
     * page exactly as the provider left it. Services first: it is the one a
     * salon is more likely to have forgotten, and naming only the first missing
     * piece is what lets a provider fix one thing and try again.
     */
    private void requireSomethingBookable() {
        if (catalogue.published().isEmpty()) {
            throw new NothingToPublishException("no active service");
        }
        if (availability.combinedOpeningHours().isEmpty()) {
            throw new NothingToPublishException("no opening hours");
        }
    }

    private UUID requireCategory(String slug) {
        return categories.activeCategoryId(slug)
                .orElseThrow(() -> new UnknownCategoryException(slug));
    }
}
