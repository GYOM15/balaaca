package com.balaaca.app.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.platformkernel.tenancy.PlatformRoles;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.runtime.QuarkusPrincipal;
import io.quarkus.security.runtime.QuarkusSecurityIdentity;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.eclipse.microprofile.jwt.JsonWebToken;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The one translation that opens the back office, and every shape that must not.
 *
 * <p>What hangs on it: the nine {@code /v1/admin} routes are guarded by a role
 * read from the token's {@code scope} claim, and a Keycloak client scope belongs
 * to a CLIENT. Published that way, any provider signing in through the same
 * client could have asked for it. So the grant is a realm role on one account,
 * and this is the only thing that turns one into the other.
 */
class PlatformOperatorAugmentorTest {

    private final PlatformOperatorAugmentor augmentor = new PlatformOperatorAugmentor();

    @Test
    @DisplayName("The realm role becomes the role the admin routes require")
    void grantsTheOperatorRole() {
        assertThat(augmented(token(Map.of("roles", List.of("platform-admin"))))
                .hasRole(PlatformRoles.OPERATOR)).isTrue();
    }

    @Test
    @DisplayName("A realm role beside others is still found")
    void findsItAmongOthers() {
        assertThat(augmented(token(Map.of("roles",
                List.of("offline_access", "platform-admin", "uma_authorization"))))
                .hasRole(PlatformRoles.OPERATOR)).isTrue();
    }

    @Test
    @DisplayName("A set, because a realm may hand the claim over either way")
    void acceptsASet() {
        assertThat(augmented(token(Map.of("roles", Set.of("platform-admin"))))
                .hasRole(PlatformRoles.OPERATOR)).isTrue();
    }

    @Test
    @DisplayName("An ordinary provider gets nothing, which is the whole point")
    void grantsNothingToEverybodyElse() {
        assertThat(augmented(token(Map.of("roles", List.of("offline_access"))))
                .hasRole(PlatformRoles.OPERATOR)).isFalse();
    }

    @Test
    @DisplayName("A near miss is a miss")
    void doesNotMatchLoosely() {
        assertThat(augmented(token(Map.of("roles", List.of("platform-admin-readonly"))))
                .hasRole(PlatformRoles.OPERATOR)).isFalse();
    }

    @Test
    @DisplayName("Shapes Keycloak may hand over are read without throwing")
    void survivesEveryClaimShape() {
        // A realm that issues no realm roles has no claim at all; one issuing
        // them elsewhere has a map without the key. Neither is an error, and a
        // token that cannot be inspected is simply a token without the role -
        // throwing here would turn every sign-in into a 500.
        assertThat(augmented(token(null)).hasRole(PlatformRoles.OPERATOR)).isFalse();
        assertThat(augmented(token(Map.of())).hasRole(PlatformRoles.OPERATOR)).isFalse();
        assertThat(augmented(token(Map.of("roles", "platform-admin")))
                .hasRole(PlatformRoles.OPERATOR)).isFalse();
    }

    @Test
    @DisplayName("A principal that is not a token carries no realm roles to read")
    void ignoresANonTokenPrincipal() {
        SecurityIdentity plain = QuarkusSecurityIdentity.builder()
                .setPrincipal(new QuarkusPrincipal("kc-somebody"))
                .build();

        assertThat(augment(plain).hasRole(PlatformRoles.OPERATOR)).isFalse();
    }

    @Test
    @DisplayName("An anonymous caller is left exactly as it arrived")
    void leavesAnonymousAlone() {
        SecurityIdentity anonymous = QuarkusSecurityIdentity.builder().setAnonymous(true).build();

        assertThat(augment(anonymous)).isSameAs(anonymous);
    }

    private SecurityIdentity augmented(JsonWebToken token) {
        return augment(QuarkusSecurityIdentity.builder().setPrincipal(token).build());
    }

    private SecurityIdentity augment(SecurityIdentity identity) {
        return augmentor.augment(identity, null).await().indefinitely();
    }

    /** @param realmAccess the `realm_access` claim, or null for a token without one */
    private static JsonWebToken token(Map<String, Object> realmAccess) {
        return new JsonWebToken() {
            @Override
            public String getName() {
                return "kc-somebody";
            }

            @Override
            public Set<String> getClaimNames() {
                return realmAccess == null ? Set.of() : Set.of("realm_access");
            }

            @Override
            @SuppressWarnings("unchecked")
            public <T> T getClaim(String claimName) {
                return "realm_access".equals(claimName) ? (T) realmAccess : null;
            }
        };
    }
}
