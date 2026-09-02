package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProfileEdit;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProviderProfile;
import java.util.Optional;
import java.util.UUID;

/** The current tenant's own row, read and written. */
public interface ProviderProfileRepository {

    ProviderProfile current();

    /** @param localitySlug already canonical, or empty to clear the field */
    ProviderProfile update(ProfileEdit edit, Optional<UUID> categoryId,
                           Optional<String> localitySlug);

    /**
     * @return the name the row held before, so the caller can drop the file it
     *         pointed at. Empty when there was none
     */
    com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.BookingPolicy currentPolicy();

    com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.BookingPolicy updatePolicy(
            com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.BookingPolicy policy);

    Optional<String> replaceLogo(String name);

    Optional<String> replaceCover(String name);

    /**
     * The three letters this business's codes are prefixed with.
     *
     * <p>Asked for rather than derived, because the database already answers it
     * for a booking reference and two implementations of "the initials" would
     * eventually disagree about the same name.
     */
    String initials();
}
