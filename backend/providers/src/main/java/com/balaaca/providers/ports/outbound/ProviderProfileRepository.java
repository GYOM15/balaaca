package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProfileEdit;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProviderProfile;
import java.util.Optional;
import java.util.UUID;

/** The current tenant's own row, read and written. */
public interface ProviderProfileRepository {

    ProviderProfile current();

    ProviderProfile update(ProfileEdit edit, Optional<UUID> categoryId);

    /**
     * @return the name the row held before, so the caller can drop the file it
     *         pointed at. Empty when there was none
     */
    com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.BookingPolicy currentPolicy();

    com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.BookingPolicy updatePolicy(
            com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.BookingPolicy policy);

    Optional<String> replaceLogo(String name);

    Optional<String> replaceCover(String name);
}
