package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.ModeratedProvider;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.Moderation;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.Report;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.Position;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** The moderator's statements, and nothing else. */
public interface ModerationRepository {

    /** Every business, by name, across every tenant. */
    List<ModeratedProvider> providers(Optional<String> search, Optional<String> status,
                                      Optional<Position> after, int limit);

    /** @return empty when there is nothing to suspend */
    Optional<Moderation> suspend(String slug, String reason);

    /** @return empty when there is nothing to reinstate */
    Optional<Moderation> reinstate(String slug);

    List<Report> reports(Optional<String> status, Optional<UUID> after, int limit);

    Optional<Report> review(UUID reportId);

    /** @return empty when the reference names no appointment */
    Optional<UUID> fileReport(String reference, String reason, Optional<String> details);
}
