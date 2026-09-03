package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The category does not exist, or is no longer offered.
 *
 * <p>Refused rather than quietly stored as none: a salon that picked "coiffure"
 * and silently got nothing would not appear under it, and would have no way to
 * find out.
 */
public final class UnknownCategoryException extends DomainException {

    public UnknownCategoryException(String slug) {
        super("VALIDATION_FAILED", 400, "No such category", Map.of("category_slug", slug));
    }
}
