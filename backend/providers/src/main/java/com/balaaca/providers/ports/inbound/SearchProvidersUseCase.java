package com.balaaca.providers.ports.inbound;

import java.util.List;
import java.util.Optional;

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
     * @param categorySlugs any of these trades matches; empty means all of them.
     *                      Several because a wedding is not a trade - it is a
     *                      query over the trades a wedding needs
     * @param after the last card of the previous page, so paging resumes
     *              exactly where the caller stopped reading
     */
    /**
     * @param locality a region, a prefecture or a commune of Conakry, by slug or
     *                 by one of its accepted spellings. Matched down the TREE:
     *                 asking for Conakry returns a business filed under Ratoma,
     *                 and asking for Ratoma returns only Ratoma
     * @param area     the quartier the provider wrote for themselves. Folded
     *                 before it is compared, which is what makes "Ratoma",
     *                 "ratoma" and "RATOMA" one value rather than three
     */
    record Query(Optional<String> nameContains,
                 List<String> categorySlugs,
                 Optional<String> city,
                 Optional<String> locality,
                 Optional<String> area,
                 Optional<Position> after,
                 int limit) {

        public Query {
            categorySlugs = List.copyOf(categorySlugs);
        }
    }

    /**
     * Two values, because one is not enough: two salons can be called Chez
     * Fatou, and a cursor that could not tell them apart would drop one or
     * repeat it at every page boundary.
     *
     * <p>The tiebreaker is the SLUG, not the row id. A cursor is handed to an
     * unauthenticated caller on every page, so whatever is in it is published -
     * and the row id is the value RLS compares in {@code id =
     * app_current_provider()} and the one the contract says is returned once and
     * never accepted back. Paging the hub one entry at a time would have
     * harvested the internal identifier of every business on the platform. The
     * slug is unique, so it orders just as well, and it is already on the QR
     * code.
     */
    record Position(String businessName, String slug) {
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
                        Optional<String> localitySlug,
                        Optional<String> localityLabel,
                        Optional<String> area,
                        Position position) {
    }

    record Directory(List<ProviderCard> cards, Optional<Position> next) {
    }
}
