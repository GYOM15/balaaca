package com.balaaca.app.security;

import com.balaaca.platformkernel.tenancy.PlatformRoles;
import io.quarkus.security.identity.AuthenticationRequestContext;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.SecurityIdentityAugmentor;
import io.quarkus.security.runtime.QuarkusSecurityIdentity;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.eclipse.microprofile.jwt.JsonWebToken;

/**
 * Turns a per-USER realm role into the role the back office requires.
 *
 * <p>This exists because of a trap that would otherwise have opened the
 * platform's own administration to every business on it. Roles are read from
 * the token's {@code scope} claim:
 *
 * <pre>quarkus.oidc.roles.role-claim-path=scope</pre>
 *
 * <p>and a Keycloak CLIENT SCOPE is attached to a client, not to a person.
 * The six provider scopes are optional scopes on {@code balaaca-frontend},
 * which means any account signing in through it may ask for them - harmless
 * there, because what confines a provider is row-level security and the tenant
 * bound server-side, never the scope. Granting {@code admin:moderation} the
 * same way would have been the opposite: the scope IS the guard on those nine
 * routes, so any provider could have requested it and suspended anybody.
 *
 * <p>A REALM ROLE is the only thing Keycloak puts in a token per account. It
 * arrives under {@code realm_access.roles}, which the role-claim-path above
 * does not read, so this translates one into the other and nothing else. The
 * provider path is untouched.
 *
 * <p>Granting it to somebody is therefore one deliberate act against one named
 * account, and revoking it is the same act undone - see docs/DEPLOYMENT.md.
 */
@ApplicationScoped
public class PlatformOperatorAugmentor implements SecurityIdentityAugmentor {

    /**
     * The realm role a human is given. Named apart from the scope it grants:
     * one is what an administrator ticks in Keycloak, the other is what the
     * code checks, and conflating them is how the client-scope trap above gets
     * reintroduced by somebody reading only half of this.
     */
    static final String REALM_ROLE = "platform-admin";

    private static final String REALM_ACCESS = "realm_access";
    private static final String ROLES = "roles";

    @Override
    public Uni<SecurityIdentity> augment(SecurityIdentity identity,
                                         AuthenticationRequestContext context) {
        if (identity.isAnonymous() || !carriesTheRealmRole(identity)) {
            return Uni.createFrom().item(identity);
        }
        return Uni.createFrom().item(QuarkusSecurityIdentity.builder(identity)
                .addRole(PlatformRoles.OPERATOR)
                .build());
    }

    /**
     * Read defensively, because the shape is Keycloak's and not ours: a realm
     * that issues no realm roles has no claim at all, and one that issues them
     * for a different client has a map without the key. Neither is an error and
     * neither may throw - a token that cannot be inspected is simply a token
     * without the role.
     */
    private static boolean carriesTheRealmRole(SecurityIdentity identity) {
        if (!(identity.getPrincipal() instanceof JsonWebToken token)) {
            return false;
        }
        Object claim = token.getClaim(REALM_ACCESS);
        if (!(claim instanceof Map<?, ?> access)) {
            return false;
        }
        Object roles = access.get(ROLES);
        return switch (roles) {
            case List<?> list -> list.stream().anyMatch(PlatformOperatorAugmentor::isTheRole);
            case Set<?> set -> set.stream().anyMatch(PlatformOperatorAugmentor::isTheRole);
            case null, default -> false;
        };
    }

    private static boolean isTheRole(Object value) {
        return value != null && REALM_ROLE.equals(value.toString());
    }
}
