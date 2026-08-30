package com.balaaca.platformkernel.tenancy;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import java.security.Principal;
import java.util.Optional;
import org.eclipse.microprofile.jwt.JsonWebToken;

/**
 * The verified caller, read from the security identity rather than from an
 * injected {@link JsonWebToken}.
 *
 * <p>That distinction has already cost one defect and is the reason this class
 * exists rather than the two call sites each reaching for the token: the
 * {@code JsonWebToken} bean only exists while a particular extension is active,
 * so an injection point on it resolves to nothing the moment OIDC is switched
 * off - and the caller is then refused with no way to tell that apart from a
 * genuine refusal. The identity is always there; what varies is the principal
 * it carries, and only a token principal has a subject.
 *
 * <p>Nothing here is authorisation. The subject is an opaque Keycloak
 * identifier, and what a caller may do is still resolved from the database on
 * every request (see {@link TenantBoundInterceptor}).
 */
@RequestScoped
public class AuthenticatedSubject {

    private final SecurityIdentity identity;

    public AuthenticatedSubject(SecurityIdentity identity) {
        this.identity = identity;
    }

    /** Empty for an anonymous caller, or one whose principal carries no subject. */
    public Optional<String> subject() {
        return token().map(JsonWebToken::getSubject).filter(s -> !s.isBlank());
    }

    public String require() {
        return subject().orElseThrow(UnauthenticatedException::new);
    }

    /**
     * What to call this person, from the token and never from a request body: a
     * caller does not get to choose who they are. Falls back through the claims
     * a realm may or may not populate, and finally to the subject, because a
     * display name is a label and an absent one must not refuse a signup.
     */
    public String displayName() {
        return token()
                .map(t -> claim(t, "name")
                        .or(() -> claim(t, "preferred_username"))
                        .orElseGet(t::getSubject))
                .orElseThrow(UnauthenticatedException::new);
    }

    public Optional<String> email() {
        return token().flatMap(t -> claim(t, "email"));
    }

    private Optional<JsonWebToken> token() {
        Principal principal = identity.getPrincipal();
        return principal instanceof JsonWebToken t ? Optional.of(t) : Optional.empty();
    }

    private static Optional<String> claim(JsonWebToken token, String name) {
        return Optional.ofNullable(token.<String>getClaim(name)).filter(v -> !v.isBlank());
    }
}
