package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.SearchProvidersUseCase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

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

        // ILIKE '%x%' rather than a similarity operator: the trigram GIN index
        // on business_name serves it, and unlike a ranked match it does not
        // reorder results, which is what lets the cursor stay meaningful.
        var statement = em.createNativeQuery("""
                SELECT p.slug, p.business_name, p.description, c.slug, p.city,
                       p.logo_url, p.id
                  FROM providers p
                  LEFT JOIN provider_categories c ON c.id = p.category_id
                 WHERE (CAST(:name AS varchar) IS NULL
                        OR p.business_name ILIKE '%' || CAST(:name AS varchar) || '%')
                   AND (CAST(:category AS varchar) IS NULL
                        OR c.slug = CAST(:category AS varchar))
                   AND (CAST(:city AS varchar) IS NULL
                        OR lower(p.city) = lower(CAST(:city AS varchar)))
                   AND (CAST(:afterName AS varchar) IS NULL
                        OR (p.business_name, p.id)
                           > (CAST(:afterName AS varchar), CAST(:afterId AS uuid)))
                 ORDER BY p.business_name, p.id
                 LIMIT :window
                """)
                .setParameter("name", query.nameContains().orElse(null))
                .setParameter("category", query.categorySlug().orElse(null))
                .setParameter("city", query.city().orElse(null))
                .setParameter("afterName", query.after().map(Position::businessName).orElse(null))
                .setParameter("afterId", query.after().map(Position::id).orElse(null))
                .setParameter("window", window);

        List<Object[]> rows = statement.getResultList();

        List<ProviderCard> cards = new ArrayList<>();
        for (Object[] r : rows.stream().limit(query.limit()).toList()) {
            cards.add(new ProviderCard(
                    (String) r[0], (String) r[1],
                    text(r[2]), text(r[3]), text(r[4]), text(r[5]),
                    new Position((String) r[1], (UUID) r[6])));
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
