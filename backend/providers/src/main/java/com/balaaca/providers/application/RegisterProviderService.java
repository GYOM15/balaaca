package com.balaaca.providers.application;

import com.balaaca.providers.domain.UnknownCategoryException;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase;
import com.balaaca.providers.ports.outbound.ProviderRegistrationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.Optional;
import java.util.UUID;

/**
 * Signing a business up.
 *
 * <p>One transaction, and it has to be: the account, the business and the
 * owner's membership are useless apart. A provider with no owner row resolves to
 * no tenant and is unreachable by the person who just created it, while an owner
 * row pointing at nothing would break every join that reads it.
 *
 * <p>Uniqueness is left to the database rather than checked first. Two taps on a
 * slow connection race, both read a free slug, and both write it; a
 * check-then-insert only narrows the window it pretends to close.
 */
@ApplicationScoped
public class RegisterProviderService implements RegisterProviderUseCase {

    private final ProviderRegistrationRepository registrations;

    public RegisterProviderService(ProviderRegistrationRepository registrations) {
        this.registrations = registrations;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public RegisteredProvider register(Registration registration) {
        Optional<UUID> categoryId = registration.categorySlug().map(this::requireCategory);
        return new RegisteredProvider(registrations.register(registration, categoryId),
                                      registration.slug());
    }

    private UUID requireCategory(String slug) {
        return registrations.activeCategoryId(slug)
                .orElseThrow(() -> new UnknownCategoryException(slug));
    }
}
