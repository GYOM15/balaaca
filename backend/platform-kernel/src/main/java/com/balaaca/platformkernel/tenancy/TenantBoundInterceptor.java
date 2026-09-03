package com.balaaca.platformkernel.tenancy;

import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.sharedkernel.error.DomainException;
import jakarta.annotation.Priority;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;
import java.util.Map;

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
    private final AuditTrail audit;

    public TenantBoundInterceptor(AuthenticatedSubject caller,
                                  TenantContext tenantContext,
                                  ProviderMembershipResolver memberships,
                                  AuditTrail audit) {
        this.caller = caller;
        this.tenantContext = tenantContext;
        this.memberships = memberships;
        this.audit = audit;
    }

    @AroundInvoke
    Object bind(InvocationContext ctx) throws Exception {
        // A caller with no subject is refused here rather than at 401: these
        // routes sit behind @Authenticated, so reaching this with no subject
        // means the identity carries no token, and answering "you belong to no
        // provider" is the same closed door either way.
        String subject = caller.subject().orElse(null);
        if (subject == null) {
            throw refused(ctx, new NoProviderMembershipException(null));
        }
        try {
            tenantContext.assign(memberships.requireFor(subject));
        } catch (DomainException e) {
            // A valid token belonging to nobody here is the refusal an operator
            // most wants to read, and it has no tenant by definition.
            throw refused(ctx, e);
        }
        try {
            return ctx.proceed();
        } catch (DomainException e) {
            throw refused(ctx, e);
        } finally {
            tenantContext.clear();
        }
    }

    /**
     * Records a refusal while the tenant is still bound, which is the whole
     * reason this lives here rather than in the exception mapper.
     *
     * <p>By the time a JAX-RS mapper runs, this interceptor's {@code finally}
     * has already cleared the context - so a mapper would write every refusal
     * with no provider and no actor, which is a trail that names nobody. Here
     * the transaction opened further in has already rolled back, so the audit
     * row opens its own and survives.
     *
     * <p>Only 403s. A 404 is not a refusal, it is an answer; a 409 is a business
     * outcome; and recording either would bury the ones that matter.
     */
    private DomainException refused(InvocationContext ctx, DomainException e) {
        if (e.status() == 403) {
            audit.recordRefusal(AuditEvent.denied(
                    "ACCESS_REFUSED", "request",
                    Map.of("code", e.code(),
                           "operation", ctx.getMethod().getName())));
        }
        return e;
    }
}
