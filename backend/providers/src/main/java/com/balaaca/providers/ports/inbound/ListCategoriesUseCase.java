package com.balaaca.providers.ports.inbound;

import java.util.List;
import java.util.Optional;

/**
 * The trades a customer can browse by.
 *
 * <p>Reference data, not tenant data: {@code provider_categories} carries no
 * provider column and no row-level security, because the taxonomy is the same
 * for everyone and a signup has to be able to name one before it has a tenant.
 */
public interface ListCategoriesUseCase {

    /** Offered trades only, in the order they should be shown. */
    List<Category> offered();

    /** @param icon a name a client resolves in its own set, never a URL */
    /**
     * @param family      the heading a client groups this trade under. Empty for
     *                    a trade that fits none, which lands in a "Divers"
     *                    bucket rather than blocking the migration that adds it
     * @param providerCount how many PUBLISHED providers hold it, counted the way
     *                    the directory itself counts. It exists so a client can
     *                    show the trades that hold somebody and keep the rest
     *                    behind "see all": that is what makes adding a trade
     *                    cost nothing on the day it lands, and it is the whole
     *                    reason seventeen of them could be added at once
     */
    record Category(String slug, String labelFr, Optional<String> icon,
                    Optional<Family> family, int providerCount) {
    }

    record Family(String slug, String labelFr, Optional<String> icon) {
    }
}
