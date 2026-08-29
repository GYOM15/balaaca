package com.balaaca.platformkernel.tenancy;

import jakarta.annotation.Priority;
import jakarta.enterprise.inject.Instance;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;
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

    private final Instance<JsonWebToken> jwt;
    private final TenantContext tenantContext;
    private final ProviderMembershipResolver memberships;

    public TenantBoundInterceptor(Instance<JsonWebToken> jwt,
                                  TenantContext tenantContext,
                                  ProviderMembershipResolver memberships) {
        this.jwt = jwt;
        this.tenantContext = tenantContext;
        this.memberships = memberships;
    }

    @AroundInvoke
    Object bind(InvocationContext ctx) throws Exception {
        String subject = jwt.isResolvable() ? jwt.get().getSubject() : null;
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
