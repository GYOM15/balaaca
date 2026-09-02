package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.SearchProvidersUseCase;
import com.balaaca.sharedkernel.money.Currency;
import com.balaaca.sharedkernel.money.Money;
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
 * <p>The row id never leaves the statement. It was returned once, for the
 * cursor, and that handed an unauthenticated caller walking the hub one entry
 * at a time the internal identifier of every business on the platform - the one
 * value the rest of the contract keeps off the public wire. The slug orders
 * just as well and is already public. The card's aggregate joins on the id
 * because a join needs a key, and the outer projection does not carry it.
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
        //
        // Two statements would have been the obvious shape - the page, then its
        // services - and it is the shape that scales worst: the second one is
        // written once and issued twenty-four times. So the page is cut first,
        // in a CTE, and everything else hangs off it.
        var statement = em.createNativeQuery("""
                WITH page AS (
                SELECT p.id, p.slug, p.business_name, p.description,
                       c.slug AS category_slug, p.city,
                       p.logo_url, l.slug AS locality_slug, l.label_fr, p.area
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
                ),
                -- The card's foot, in one grouped pass over the offerings of the
                -- providers already on the page - not a lateral and not a
                -- subquery in the select list, either of which is this statement
                -- issued again once per card, on every page, for every visitor.
                --
                -- Reads service_offerings with no tenant bound, exactly as the
                -- name search above does, and V022's public-read policy is what
                -- admits the rows: the services of a published business, which
                -- the provider's own page already publishes one business at a
                -- time. Nothing here widens that.
                --
                -- `active` is restated rather than left to the policy because it
                -- is not the same rule twice: the policy decides what this
                -- connection may SEE, and the contract decides what the card
                -- AGGREGATES, which is the offerings a customer could book
                -- today. They coincide, and they answer to different owners.
                offered AS (
                SELECT so.provider_id,
                       bool_or(so.offers_on_site)     AS on_site,
                       bool_or(so.offers_drop_off)    AS drop_off,
                       bool_or(so.offers_at_customer) AS at_customer,
                       -- A floor over the prices the provider chose to show. A
                       -- hidden price is not a cheap one, so it is not counted;
                       -- with none shown the floor is NULL, which is the honest
                       -- answer and not zero.
                       min(so.price_amount_minor) FILTER (WHERE so.price_visible)
                           AS price_from_minor,
                       -- The currency of the row the floor came from, rather
                       -- than any row's. Ordering by the amount alone would pick
                       -- arbitrarily between two services priced the same, so
                       -- the code breaks the tie and the answer stops depending
                       -- on the plan.
                       (array_agg(so.price_currency
                                  ORDER BY so.price_amount_minor, so.price_currency)
                        FILTER (WHERE so.price_visible))[1] AS price_from_currency
                  FROM service_offerings so
                  JOIN page ON page.id = so.provider_id
                 WHERE so.active
                 GROUP BY so.provider_id
                )
                -- page.id is joined on and never selected: the row id is the
                -- one value the public wire does not carry, and a card is as
                -- public as a cursor.
                SELECT page.slug, page.business_name, page.description,
                       page.category_slug, page.city, page.logo_url,
                       page.locality_slug, page.label_fr, page.area,
                       -- A provider with nothing active has no row here, and
                       -- absent means offers nothing - not unknown.
                       coalesce(o.on_site, false), coalesce(o.drop_off, false),
                       coalesce(o.at_customer, false),
                       o.price_from_minor, o.price_from_currency
                  FROM page
                  LEFT JOIN offered o ON o.provider_id = page.id
                 ORDER BY page.business_name, page.slug
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
                    new Fulfilments((Boolean) r[9], (Boolean) r[10], (Boolean) r[11]),
                    money(r[12], r[13]),
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

    /**
     * Empty rather than zero when there is no floor to quote.
     *
     * <p>The currency is read back through the closed enum instead of being
     * passed along as three letters. A code the platform does not know is a row
     * nobody can price, and a directory that quietly dropped the amount would
     * hide it until a customer asked why the card said nothing.
     */
    private static Optional<Money> money(Object amountMinor, Object currency) {
        if (amountMinor == null || currency == null) {
            return Optional.empty();
        }
        return Optional.of(Money.ofMinor(((Number) amountMinor).longValue(),
                                         Currency.of((String) currency)));
    }
}
