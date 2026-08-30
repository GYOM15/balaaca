package com.balaaca.providers.ports.outbound;

import com.balaaca.platformkernel.tenancy.ProviderId;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase.Registration;
import java.util.Optional;
import java.util.UUID;

/** Writes the rows that make a tenant exist. */
public interface ProviderRegistrationRepository {

    /**
     * The account, the business and the owner's membership, in one statement.
     *
     * @throws com.balaaca.providers.domain.SlugUnavailableException  the handle is taken
     * @throws com.balaaca.providers.domain.AlreadyRegisteredException this account has one
     */
    ProviderId register(Registration registration, Optional<UUID> categoryId);

    /** Empty when the slug names nothing, or names a category no longer offered. */
    Optional<UUID> activeCategoryId(String slug);
}
