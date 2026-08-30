package com.balaaca.platformkernel.tenancy;

import jakarta.annotation.Priority;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;
import java.security.Principal;
import org.eclipse.microprofile.jwt.JsonWebToken;

/**
 * Resolves the tenant from the verified JWT subject against provider_staff, and
 * clears it afterwards.
 *
 * <p>The subject is the only thing taken from the token. Membership itself is
 * read from the database on every request, uncached: a cached membership is a
 * window during which a removed staff member still has access, which is the
 * exact defect that ruled out putting the tenant in a claim.
 *
 * <p>The priority puts this outside the transaction Quarkus opens at
 * {@code PLATFORM_BEFORE + 200}, which is why it cannot be what sets the
 * database session variable - see {@link TenantGucPoolInterceptor}.
 *
 * <p>The token is injected as {@link Instance} because it is genuinely optional:
 * OIDC is off until the realm exists, and the public booking path binds its
 * tenant from a published slug instead. An unsatisfied token here is a caller
 * with no identity, which fails closed like any other.
 */
@TenantBound
@Interceptor
@Priority(Interceptor.Priority.PLATFORM_BEFORE + 10)
public class TenantBoundInterceptor {

    private final SecurityIdentity identity;
    private final TenantContext tenantContext;
    private final ProviderMembershipResolver memberships;

    public TenantBoundInterceptor(SecurityIdentity identity,
                                  TenantContext tenantContext,
                                  ProviderMembershipResolver memberships) {
        this.identity = identity;
        this.tenantContext = tenantContext;
        this.memberships = memberships;
    }

    /**
     * The subject, taken from the identity rather than from an injected
     * {@code JsonWebToken}.
     *
     * <p>That bean only exists while a particular extension is active, so an
     * injection point on it resolves to nothing the moment the provider is
     * switched off - and this interceptor then read a null subject and refused
     * every caller, with the same 403 it gives someone who genuinely belongs to
     * no provider. Two very different problems, one answer, and nothing in the
     * log to tell them apart.
     *
     * <p>The identity is always there. What varies is the principal it carries,
     * and only a token principal has a subject to resolve.
     */
    private static String subjectOf(Principal principal) {
        return principal instanceof JsonWebToken token ? token.getSubject() : null;
    }

    @AroundInvoke
    Object bind(InvocationContext ctx) throws Exception {
        String subject = subjectOf(identity.getPrincipal());
        if (subject == null || subject.isBlank()) {
            throw new NoProviderMembershipException(subject);
        }
        tenantContext.assign(memberships.requireFor(subject));
        try {
            return ctx.proceed();
        } finally {
            tenantContext.clear();
        }
    }
}
