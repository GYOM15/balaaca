package com.balaaca.providers.domain;

/**
 * Where a business stands with the platform.
 *
 * <p>Not the same question as whether its page is live, which is {@code
 * published}. A suspended provider keeps whatever it published and still
 * disappears from the public path: one is the platform's decision, the other is
 * the provider's, and collapsing them into one column would make it impossible
 * to give a suspension back without guessing what the provider had chosen.
 */
public enum ProviderStatus {

    /** Registered, nothing verified, nothing published. Where every salon starts. */
    PENDING,
    ACTIVE,
    SUSPENDED,
    CLOSED
}
