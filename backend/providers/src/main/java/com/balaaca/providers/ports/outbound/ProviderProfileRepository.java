package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProfileEdit;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProviderProfile;
import java.util.Optional;
import java.util.UUID;

/** The current tenant's own row, read and written. */
public interface ProviderProfileRepository {

    ProviderProfile current();

    ProviderProfile update(ProfileEdit edit, Optional<UUID> categoryId);
}
