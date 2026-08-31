package com.balaaca.providers.application;

import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditOutcome;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.platformkernel.ratelimit.AttemptLimiter;
import com.balaaca.platformkernel.ratelimit.TooManyAttemptsException;
import java.time.Duration;
import com.balaaca.providers.domain.UnknownCategoryException;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase;
import com.balaaca.providers.ports.outbound.ProviderRegistrationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Signing a business up.
 *
 * <p>One transaction, and it has to be: the account, the business and the
 * owner's membership are useless apart. A provider with no owner row resolves to
 * no tenant and is unreachable by the person who just created it, while an owner
 * row pointing at nothing would break every join that reads it.
 *
 * <p>Uniqueness is left to the database rather than checked first. Two taps on a
 * slow connection race, both read a free slug, and both write it; a
 * check-then-insert only narrows the window it pretends to close.
 */
@ApplicationScoped
public class RegisterProviderService implements RegisterProviderUseCase {

    /**
     * Ten tries an hour, per account.
     *
     * <p>Generous for a person - registering is something you do once, and a
     * slug refused twice is normal - and useless for a script. V020 closed the
     * handle oracle for an account that already has a salon; this closes it for
     * one that does not, which is the half that was left. There is no cheaper
     * way to enumerate handles than to ask, so the answer is to make asking
     * expensive rather than to make it lie.
     */
    private static final int ATTEMPTS_PER_HOUR = 10;

    private final ProviderRegistrationRepository registrations;
    private final AttemptLimiter attempts;
    private final AuditTrail audit;

    public RegisterProviderService(ProviderRegistrationRepository registrations,
                                   AttemptLimiter attempts,
                                   AuditTrail audit) {
        this.registrations = registrations;
        this.attempts = attempts;
        this.audit = audit;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public RegisteredProvider register(Registration registration) {
        // Keyed on the verified subject, not on an address: a header a client
        // controls is not an identity, and the route is authenticated anyway,
        // so an attacker needs an account before they need a budget.
        //
        // Counted before the work, so a refused slug costs a try. That is the
        // point - a probe and a genuine mistake look identical from here, and
        // charging only for successes would leave the enumeration free.
        if (!attempts.withinBudget("ratelimit:register:" + registration.account().subject(),
                                   ATTEMPTS_PER_HOUR, Duration.ofHours(1))) {
            throw new TooManyAttemptsException("register_provider");
        }

        Optional<UUID> categoryId = registration.categorySlug().map(this::requireCategory);
        var providerId = registrations.register(registration, categoryId);

        // A platform row, not a tenant one: no tenant is bound during a signup,
        // which is the whole reason V014 exists. The provider it created is in
        // the metadata rather than in provider_id, because writing it there
        // would need a binding this request deliberately does not have.
        audit.record(new AuditEvent("PROVIDER_REGISTERED", "provider",
                Optional.of(providerId.toString()), AuditOutcome.SUCCESS,
                Map.of("slug", registration.slug())));

        return new RegisteredProvider(providerId, registration.slug());
    }

    private UUID requireCategory(String slug) {
        return registrations.activeCategoryId(slug)
                .orElseThrow(() -> new UnknownCategoryException(slug));
    }
}
