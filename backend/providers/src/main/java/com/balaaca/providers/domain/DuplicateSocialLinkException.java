package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The same network was listed twice in one save.
 *
 * <p>Two Instagram accounts under one name is a mistake rather than a feature,
 * and {@code UNIQUE (provider_id, kind)} is what says so. Refused rather than
 * silently keeping the last one: a provider who pasted into the wrong field
 * would otherwise watch the right value disappear with no explanation.
 */
public final class DuplicateSocialLinkException extends DomainException {

    public DuplicateSocialLinkException(SocialNetwork kind) {
        super("VALIDATION_FAILED", 400, "This network is listed twice",
              Map.of("kind", kind.name()));
    }
}
