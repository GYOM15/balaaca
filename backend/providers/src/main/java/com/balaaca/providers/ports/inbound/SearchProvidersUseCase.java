package com.balaaca.providers.ports.inbound;

import com.balaaca.sharedkernel.money.Money;
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
     * @param modes    the same triple a card publishes, read the other way
     *                 round: each true is a way of being served the caller ASKED
     *                 for, and a business matches on ANY of them. All three
     *                 false is no filter at all - nobody asks for a business
     *                 that offers nothing, so the value is free to mean the
     *                 absence of the question
     */
    record Query(Optional<String> nameContains,
                 List<String> categorySlugs,
                 Optional<String> city,
                 Optional<String> locality,
                 Optional<String> area,
                 Fulfilments modes,
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
     * The ways a business can be reached, gathered over the services it
     * currently offers. Three answers rather than a set of a fourth enum: this
     * is the shape the column holds, the edge already turns predicates like it
     * into the published vocabulary, and a second Java word for a value the
     * contract already names is a word that can drift from it.
     *
     * <p>All three false is a real answer and not a missing one - a business
     * that has published nothing yet has nothing to offer, and a card that
     * invented a mode for it would be advertising something nobody said.
     *
     * <p>The same shape carries the QUESTION on {@link Query}, deliberately.
     * One definition of what a business offers is what keeps a filter from
     * returning a card whose own badges contradict it.
     */
    record Fulfilments(boolean onSite, boolean dropOff, boolean atCustomer) {

        /** Whether anything at all was asked for, on the query side. */
        public boolean any() {
            return onSite || dropOff || atCustomer;
        }
    }

    /**
     * What a card shows. No phone, no email: a directory that hands out every
     * provider's contact details in one request is a marketing list, and one
     * request is all it would take.
     *
     * <p>{@code fulfilments} and {@code priceFrom} are DERIVED and never
     * authored: a business says it travels by publishing a service that does,
     * and stops saying so by retiring it. The price is the floor over the
     * services whose price is visible, so it is empty when there is nothing to
     * take a floor of - which is not zero, and a card that drew it as zero
     * would read as free.
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
                        Fulfilments fulfilments,
                        Optional<Money> priceFrom,
                        Position position) {
    }

    /**
     * @param total how many businesses the query matches in all, not how many
     *              are on this page and not how many are left. It ignores the
     *              cursor, so it is the same number on the first page and the
     *              last, and it is exact rather than capped - see the contract,
     *              which owns that decision and its cost
     */
    record Directory(List<ProviderCard> cards, Optional<Position> next, int total) {
    }
}
