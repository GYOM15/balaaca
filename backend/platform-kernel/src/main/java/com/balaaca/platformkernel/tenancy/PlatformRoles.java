package com.balaaca.platformkernel.tenancy;

/**
 * The roles that are about the PLATFORM rather than about a business.
 *
 * <p>One constant with two readers, which is the whole reason it exists: the
 * augmentor that grants it from a Keycloak realm role and the audit trail that
 * labels the line it writes. Spelt twice they would be the defect this codebase
 * keeps paying for - a rename in one place, and every platform action silently
 * filed under no role at all.
 */
public final class PlatformRoles {

    /**
     * What the nine {@code /v1/admin} routes require.
     *
     * <p>The name is the SCOPE the contract publishes, because roles are read
     * from the token's {@code scope} claim. It is deliberately NOT granted as a
     * client scope - see {@code PlatformOperatorAugmentor} for why that would
     * hand the back office to every provider on the platform.
     */
    public static final String OPERATOR = "admin:moderation";

    private PlatformRoles() {
    }
}
