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
    record Category(String slug, String labelFr, Optional<String> icon) {
    }
}
