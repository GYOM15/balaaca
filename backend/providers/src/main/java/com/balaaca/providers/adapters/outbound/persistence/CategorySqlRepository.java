package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.ListCategoriesUseCase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Optional;

/**
 * The taxonomy, in SQL.
 *
 * <p>No tenant predicate and none possible: this table has no provider column.
 * It is reference data, readable by the application role with no row-level
 * security at all, which is what lets a signup name a trade before it has a
 * tenant to be scoped to.
 *
 * <p>Transactional anyway. Every other read in this codebase is, because the
 * tenant binding is a SET LOCAL - and a method that is the one exception is a
 * method someone copies.
 */
@ApplicationScoped
public class CategorySqlRepository implements ListCategoriesUseCase {

    private final EntityManager em;

    public CategorySqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public List<Category> offered() {
        // Ordered by the family first, so a client that groups them reads them
        // in one pass instead of sorting thirty-five rows itself.
        List<Object[]> rows = em.createNativeQuery("""
                SELECT c.slug, c.label_fr, c.icon,
                       f.slug, f.label_fr, f.icon,
                       n.provider_count
                  FROM provider_categories c
                  LEFT JOIN provider_category_families f
                         ON f.id = c.family_id AND f.active
                  JOIN provider_category_counts n ON n.category_id = c.id
                 WHERE c.active
                 ORDER BY f.sort_order NULLS LAST, c.sort_order, c.label_fr
                """).getResultList();

        return rows.stream()
                .map(r -> new ListCategoriesUseCase.Category(
                        (String) r[0], (String) r[1], Optional.ofNullable((String) r[2]),
                        Optional.ofNullable((String) r[3]).map(slug -> new ListCategoriesUseCase.Family(
                                slug, (String) r[4], Optional.ofNullable((String) r[5]))),
                        ((Number) r[6]).intValue()))
                .toList();
    }
}
