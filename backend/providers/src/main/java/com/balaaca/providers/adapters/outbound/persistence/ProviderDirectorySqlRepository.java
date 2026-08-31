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
                       p.logo_url, l.slug, l.label_fr, p.area
                  FROM providers p
                  LEFT JOIN provider_categories c ON c.id = p.category_id
                  LEFT JOIN localities l ON l.id = p.locality_id
                 WHERE (CAST(:name AS varchar) IS NULL
                        OR p.business_name ILIKE '%' || CAST(:name AS varchar) || '%'
                        OR c.label_fr ILIKE '%' || CAST(:name AS varchar) || '%'
                        OR EXISTS (SELECT 1 FROM service_offerings so
                                    WHERE so.provider_id = p.id
                                      AND so.active
                                      AND so.name ILIKE '%' || CAST(:name AS varchar) || '%'))
                   AND (cardinality(CAST(:categories AS varchar[])) = 0
                        OR c.slug = ANY(CAST(:categories AS varchar[])))
                   -- The locality filter walks DOWN the tree, so a search on
                   -- Conakry returns a business filed under Ratoma, and one on
                   -- Ratoma returns only Ratoma. Equality would make every
                   -- level its own island and force a client to know which one
                   -- a provider happened to pick.
                   AND (CAST(:locality AS varchar) IS NULL
                        OR p.locality_id IN (
                            WITH RECURSIVE subtree AS (
                                SELECT id FROM localities
                                 WHERE active AND (slug = CAST(:locality AS varchar)
                                        OR CAST(:locality AS varchar) = ANY (aliases))
                                UNION ALL
                                SELECT child.id FROM localities child
                                  JOIN subtree ON child.parent_id = subtree.id
                                 WHERE child.active)
                            SELECT id FROM subtree))
                   -- The quartier. Compared on the folded column, which is what
                   -- makes "Ratoma", "ratoma" and "RATOMA" one value.
                   AND (CAST(:area AS varchar) IS NULL
                        OR p.area_folded = CAST(:area AS varchar))
                   -- Kept for the rows that predate localities and were never
                   -- resolvable: dropping it would lose the only geography they
                   -- carry.
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
                .setParameter("locality", query.locality().orElse(null))
                // Folded here, once, exactly as the generated column folds it:
                // a caller sends what somebody typed, and the two sides have to
                // agree or the filter answers nothing and looks like an empty
                // directory.
                .setParameter("area", query.area().map(ProviderDirectorySqlRepository::fold)
                        .orElse(null))
                .setParameter("afterName", query.after().map(Position::businessName).orElse(null))
                .setParameter("afterSlug", query.after().map(Position::slug).orElse(null))
                .setParameter("window", window);

        List<Object[]> rows = statement.getResultList();

        List<ProviderCard> cards = new ArrayList<>();
        for (Object[] r : rows.stream().limit(query.limit()).toList()) {
            cards.add(new ProviderCard(
                    (String) r[0], (String) r[1],
                    text(r[2]), text(r[3]), text(r[4]), text(r[5]),
                    text(r[6]), text(r[7]), text(r[8]),
                    new Position((String) r[1], (String) r[0])));
        }

        Optional<Position> next = rows.size() > cards.size() && !cards.isEmpty()
                ? Optional.of(cards.get(cards.size() - 1).position())
                : Optional.empty();

        return new Directory(List.copyOf(cards), next);
    }

    /**
     * The same fold the generated column applies.
     *
     * <p>Written twice on purpose - once in SQL where it is stored, once here
     * where a query is compared - and they have to agree. Java's own
     * normalisation is used rather than a second translate() table: it strips
     * every accent rather than the ones somebody listed, so this side is the
     * more forgiving of the two, which is the safe direction.
     */
    static String fold(String value) {
        String stripped = java.text.Normalizer
                .normalize(value, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return stripped.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private static Optional<String> text(Object column) {
        return Optional.ofNullable((String) column).filter(v -> !v.isBlank());
    }
}
