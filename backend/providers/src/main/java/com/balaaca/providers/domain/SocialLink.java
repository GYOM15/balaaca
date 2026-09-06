package com.balaaca.providers.domain;

import java.util.Objects;

/**
 * One entry in the row of icons under a business's name.
 *
 * <p>Carries the value as the owner typed it, never the composed address: a
 * record holding both would be two places holding one fact, and the composed
 * one would be the copy that goes stale the day a network changes its shape.
 * {@link #url()} composes on the way out.
 *
 * <p>The format is NOT re-checked here. It is a CHECK constraint on
 * {@code provider_links}, which is the thing that actually guarantees it for
 * every writer - an application, a migration, a {@code psql} session - and a
 * regular expression restated in Java would be a second definition that drifts
 * the first time one of them is corrected.
 */
public record SocialLink(SocialNetwork kind, String value) {

    public SocialLink {
        Objects.requireNonNull(kind, "kind");
        Objects.requireNonNull(value, "value");
    }

    /** Absolute, and always https. */
    public String url() {
        return kind.urlFor(value);
    }
}
