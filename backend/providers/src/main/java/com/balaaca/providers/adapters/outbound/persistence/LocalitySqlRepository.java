package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.ListLocalitiesUseCase.Area;
import com.balaaca.providers.ports.inbound.ListLocalitiesUseCase.Locality;
import com.balaaca.providers.ports.outbound.LocalityRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The map, and the quartiers written against it.
 *
 * <p>No tenant is bound on any of these reads and none is wanted. Localities are
 * public reference data with no provider column and no row-level security, for
 * the reason V022 recorded about the trades: the directory reads them with no
 * tenant, and a FORCE RLS table would answer nothing there.
 */
@ApplicationScoped
public class LocalitySqlRepository implements LocalityRepository {

    private final EntityManager em;

    public LocalitySqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public List<Locality> all() {
        // Parents before children, so a client builds the tree in one pass
        // instead of sorting fifty-one rows itself.
        //
        // The count beside each place is counted DOWN THE TREE, because the
        // number labels a filter and `listProviders?locality=` matches down the
        // tree. Counting only the businesses filed at exactly this level would
        // put a zero on Conakry - almost nobody files against the region - while
        // the list behind that tile held every salon in the capital.
        //
        // Which businesses are countable is left entirely to
        // `providers_public_read`: no tenant is bound on this read, so the
        // policy admits published, active rows and nothing else. Restating that
        // predicate here would be a second place to say what is public, and the
        // second place is the one that gets forgotten - after which a tile and
        // the list it opens disagree.
        //
        // Fifty-one nodes, three levels deep. The recursion is written rather
        // than the depth assumed, because a map that grows a level would
        // otherwise start undercounting silently.
        List<Object[]> rows = em.createNativeQuery("""
                WITH RECURSIVE descendants AS (
                    SELECT l.id AS root_id, l.id AS node_id
                      FROM localities l WHERE l.active
                    UNION ALL
                    SELECT d.root_id, child.id
                      FROM localities child
                      JOIN descendants d ON child.parent_id = d.node_id
                     WHERE child.active
                ),
                counted AS (
                    SELECT d.root_id, count(pr.id)::int AS providers
                      FROM descendants d
                      LEFT JOIN providers pr ON pr.locality_id = d.node_id
                     GROUP BY d.root_id
                )
                SELECT l.slug, l.label_fr, l.kind, p.slug, l.iso_3166_2,
                       coalesce(counted.providers, 0)
                  FROM localities l
                  LEFT JOIN localities p ON p.id = l.parent_id
                  LEFT JOIN counted ON counted.root_id = l.id
                 WHERE l.active
                 ORDER BY CASE l.kind WHEN 'REGION' THEN 1 WHEN 'PREFECTURE' THEN 2 ELSE 3 END,
                          l.sort_order, l.label_fr
                """).getResultList();

        return rows.stream().map(LocalitySqlRepository::toLocality).toList();
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public List<Area> areas(Optional<String> contains, Optional<String> within) {
        // Only published providers contribute: an unpublished business must not
        // be able to put a word in front of a customer.
        //
        // The label returned is the spelling MOST providers used, not the first
        // one written. That is what makes the suggestion converge - one careless
        // "NONGO" does not become the offered form for everybody after it.
        List<Object[]> rows = em.createNativeQuery("""
                WITH RECURSIVE subtree AS (
                    SELECT id FROM localities
                     WHERE active
                       AND CAST(:within AS varchar) IS NOT NULL
                       AND (slug = CAST(:within AS varchar)
                            OR CAST(:within AS varchar) = ANY (aliases))
                    UNION ALL
                    SELECT c.id FROM localities c JOIN subtree s ON c.parent_id = s.id
                     WHERE c.active
                )
                SELECT mode() WITHIN GROUP (ORDER BY p.area) AS label,
                       count(*)::int AS providers
                  FROM providers p
                 WHERE p.published
                   AND p.status IN ('PENDING', 'ACTIVE')
                   AND p.area_folded IS NOT NULL
                   AND (CAST(:contains AS varchar) IS NULL
                        OR p.area_folded LIKE '%' || CAST(:contains AS varchar) || '%')
                   AND (CAST(:within AS varchar) IS NULL
                        OR p.locality_id IN (SELECT id FROM subtree))
                 GROUP BY p.area_folded
                 ORDER BY providers DESC, label
                 LIMIT 50
                """)
                .setParameter("contains", contains.map(LocalitySqlRepository::fold).orElse(null))
                .setParameter("within", within.orElse(null))
                .getResultList();

        return rows.stream()
                .map(r -> new Area((String) r[0], ((Number) r[1]).intValue()))
                .toList();
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public Optional<String> canonicalSlug(String slugOrAlias) {
        String folded = fold(slugOrAlias);
        List<String> rows = em.createNativeQuery("""
                SELECT slug FROM localities
                 WHERE active AND (slug = :folded OR :folded = ANY (aliases))
                 LIMIT 1
                """)
                .setParameter("folded", folded)
                .getResultList();

        return rows.stream().findFirst();
    }

    private static Locality toLocality(Object[] r) {
        return new Locality((String) r[0], (String) r[1], (String) r[2],
                            Optional.ofNullable((String) r[3]),
                            Optional.ofNullable((String) r[4]),
                            ((Number) r[5]).intValue());
    }

    /**
     * The same fold the generated column applies, spelled the forgiving way.
     *
     * <p>Java strips every combining mark rather than the accents somebody
     * listed, so this side matches at least as much as the stored side - which
     * is the safe direction for a comparison written twice.
     */
    static String fold(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .trim()
                .toLowerCase(Locale.ROOT);
    }
}
