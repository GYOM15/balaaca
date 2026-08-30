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
        List<Object[]> rows = em.createNativeQuery("""
                SELECT slug, label_fr, icon
                  FROM provider_categories
                 WHERE active
                 ORDER BY sort_order, label_fr
                """).getResultList();

        return rows.stream()
                .map(r -> new Category((String) r[0], (String) r[1],
                                       Optional.ofNullable((String) r[2])))
                .toList();
    }
}
