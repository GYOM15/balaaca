package com.balaaca.providers.ports.inbound;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The hub: finding a provider without already knowing its handle.
 *
 * <p>Public and tenant-free. It is the one read on this platform that
 * deliberately spans providers, and it is safe because {@code providers} carries
 * a public-read policy admitting published rows only - the breadth comes from
 * the database's own rule, not from a role that can see everything.
 */
public interface SearchProvidersUseCase {

    Directory search(Query query);

    /**
     * @param nameContains part of a business name; the caller has already
     *                     rejected anything shorter than two characters
     * @param after the last card of the previous page, so paging resumes
     *              exactly where the caller stopped reading
     */
    record Query(Optional<String> nameContains,
                 Optional<String> categorySlug,
                 Optional<String> city,
                 Optional<Position> after,
                 int limit) {
    }

    /**
     * Two values, because one is not enough: two salons can be called Chez
     * Fatou, and a cursor that could not tell them apart would drop one or
     * repeat it at every page boundary.
     */
    record Position(String businessName, UUID id) {
    }

    /**
     * What a card shows. No phone, no email: a directory that hands out every
     * provider's contact details in one request is a marketing list, and one
     * request is all it would take.
     */
    record ProviderCard(String slug,
                        String businessName,
                        Optional<String> description,
                        Optional<String> categorySlug,
                        Optional<String> city,
                        Optional<String> logoUrl,
                        Position position) {
    }

    record Directory(List<ProviderCard> cards, Optional<Position> next) {
    }
}
