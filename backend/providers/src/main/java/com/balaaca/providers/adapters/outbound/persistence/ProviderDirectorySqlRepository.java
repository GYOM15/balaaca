package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.SearchProvidersUseCase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The directory, in SQL.
 *
 * <p>There is no {@code published} predicate in this query, and its absence is
 * the point. {@code providers_public_read} admits published rows and no others
 * to a connection with no tenant bound, so an unpublished provider is not
 * filtered out here - it does not exist as far as this role is concerned. A
 * predicate would be a second place to state the rule, and the second place is
 * the one that gets forgotten.
 *
 * <p>{@code status} is deliberately not consulted either, because nothing else
 * on the public path consults it: {@code app_resolve_published_provider} keys on
 * {@code published} alone, and a provider publishes while still {@code PENDING}
 * - that is what registration produces. Filtering the directory on
 * {@code ACTIVE} would hide every newly published salon from the list while
 * leaving it bookable by handle.
 *
 * <p>Transactional because the empty tenant binding is still a SET LOCAL, and a
 * read outside a transaction runs on a connection this request never prepared.
 *
 * <p>The row id is not selected at all. It was, for the cursor, and that handed
 * an unauthenticated caller walking the hub one entry at a time the internal
 * identifier of every business on the platform - the one value the rest of the
 * contract keeps off the public wire. The slug orders just as well and is
 * already public.
 */
@ApplicationScoped
public class ProviderDirectorySqlRepository implements SearchProvidersUseCase {

    private final EntityManager em;

    public ProviderDirectorySqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public Directory search(Query query) {
        // One row more than asked for. Its existence is the only thing that
        // decides whether there is a next page, and it is never returned - a
        // count(*) over the whole directory to answer the same question would
        // scan everything on every page.
        int window = query.limit() + 1;

        // Three places a customer's word can live, and only the first was
        // searched: the business name, the trade's own label, and what the
        // provider calls its work. Somebody looking for braids types "tresses";
        // no business is named Tresses, and the answer used to be nothing - on
        // a home page whose whole purpose is that box.
        //
        // The EXISTS reads service_offerings with no tenant bound, which
        // V022's public-read policy admits for published providers only. It
        // matches rows without fetching them, and getPublicProvider already
        // publishes exactly those rows one provider at a time.
        //
        // ILIKE '%x%' rather than a similarity operator: the trigram GIN
        // indexes serve it, and unlike a ranked match it does not reorder
        // results, which is what lets the cursor stay meaningful.
        var statement = em.createNativeQuery("""
                SELECT p.slug, p.business_name, p.description, c.slug, p.city,
                       p.logo_url
                  FROM providers p
                  LEFT JOIN provider_categories c ON c.id = p.category_id
                 WHERE (CAST(:name AS varchar) IS NULL
                        OR p.business_name ILIKE '%' || CAST(:name AS varchar) || '%'
                        OR c.label_fr ILIKE '%' || CAST(:name AS varchar) || '%'
                        OR EXISTS (SELECT 1 FROM service_offerings so
                                    WHERE so.provider_id = p.id
                                      AND so.active
                                      AND so.name ILIKE '%' || CAST(:name AS varchar) || '%'))
                   AND (cardinality(CAST(:categories AS varchar[])) = 0
                        OR c.slug = ANY(CAST(:categories AS varchar[])))
                   AND (CAST(:city AS varchar) IS NULL
                        OR lower(p.city) = lower(CAST(:city AS varchar)))
                   AND (CAST(:afterName AS varchar) IS NULL
                        OR (p.business_name, p.slug)
                           > (CAST(:afterName AS varchar), CAST(:afterSlug AS varchar)))
                 ORDER BY p.business_name, p.slug
                 LIMIT :window
                """)
                .setParameter("name", query.nameContains().orElse(null))
                .setParameter("categories",
                              query.categorySlugs().toArray(String[]::new))
                .setParameter("city", query.city().orElse(null))
                .setParameter("afterName", query.after().map(Position::businessName).orElse(null))
                .setParameter("afterSlug", query.after().map(Position::slug).orElse(null))
                .setParameter("window", window);

        List<Object[]> rows = statement.getResultList();

        List<ProviderCard> cards = new ArrayList<>();
        for (Object[] r : rows.stream().limit(query.limit()).toList()) {
            cards.add(new ProviderCard(
                    (String) r[0], (String) r[1],
                    text(r[2]), text(r[3]), text(r[4]), text(r[5]),
                    new Position((String) r[1], (String) r[0])));
        }

        Optional<Position> next = rows.size() > cards.size() && !cards.isEmpty()
                ? Optional.of(cards.get(cards.size() - 1).position())
                : Optional.empty();

        return new Directory(List.copyOf(cards), next);
    }

    private static Optional<String> text(Object column) {
        return Optional.ofNullable((String) column).filter(v -> !v.isBlank());
    }
}
