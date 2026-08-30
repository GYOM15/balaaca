package com.balaaca.platformkernel.tenancy;

import jakarta.annotation.Priority;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;

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
 * <p>The subject comes from {@link AuthenticatedSubject} rather than from an
 * injected token, for the reason recorded there.
 */
@TenantBound
@Interceptor
@Priority(Interceptor.Priority.PLATFORM_BEFORE + 10)
public class TenantBoundInterceptor {

    private final AuthenticatedSubject caller;
    private final TenantContext tenantContext;
    private final ProviderMembershipResolver memberships;

    public TenantBoundInterceptor(AuthenticatedSubject caller,
                                  TenantContext tenantContext,
                                  ProviderMembershipResolver memberships) {
        this.caller = caller;
        this.tenantContext = tenantContext;
        this.memberships = memberships;
    }

    @AroundInvoke
    Object bind(InvocationContext ctx) throws Exception {
        // A caller with no subject is refused here rather than at 401: these
        // routes sit behind @Authenticated, so reaching this with no subject
        // means the identity carries no token, and answering "you belong to no
        // provider" is the same closed door either way.
        String subject = caller.subject().orElse(null);
        if (subject == null) {
            throw new NoProviderMembershipException(null);
        }
        tenantContext.assign(memberships.requireFor(subject));
        try {
            return ctx.proceed();
        } finally {
            tenantContext.clear();
        }
    }
}
