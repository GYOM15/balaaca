package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.ContestSuspensionUseCase.Contestation;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.ContestationView;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** A business's answer, written by it and read by the operator. */
public interface ContestationRepository {

    /** The suspension the caller is under, or empty when they are not. */
    Optional<Instant> suspendedSince();

    /** @return false when this suspension has already been answered */
    boolean file(String message, Instant aboutSuspensionAt);

    Optional<Contestation> currentFor(Instant aboutSuspensionAt);

    List<ContestationView> queue(Optional<String> status, Optional<UUID> after, int limit);

    Optional<ContestationView> markRead(UUID id);
}
