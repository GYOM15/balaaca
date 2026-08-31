package com.balaaca.providers.application;

import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditOutcome;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.providers.domain.AlreadyContestedException;
import com.balaaca.providers.domain.NotSuspendedException;
import com.balaaca.providers.ports.inbound.ContestSuspensionUseCase;
import com.balaaca.providers.ports.outbound.ContestationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

/** A business answering the platform back. */
@ApplicationScoped
public class ContestSuspensionService implements ContestSuspensionUseCase {

    private final ContestationRepository contestations;
    private final AuditTrail audit;

    public ContestSuspensionService(ContestationRepository contestations, AuditTrail audit) {
        this.contestations = contestations;
        this.audit = audit;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Contestation contest(String message) {
        Instant since = contestations.suspendedSince()
                .orElseThrow(NotSuspendedException::new);

        String written = message == null ? "" : message.trim();
        if (written.isEmpty()) {
            throw new IllegalArgumentException("a contestation needs a message");
        }

        if (!contestations.file(written, since)) {
            throw new AlreadyContestedException();
        }

        // On the trail because the platform was told something, and the day a
        // provider says "I contested and nobody answered" the record has to
        // exist on the platform's side rather than only in their sent folder.
        audit.record(new AuditEvent("SUSPENSION_CONTESTED", "provider",
                Optional.empty(), AuditOutcome.SUCCESS,
                Map.of("about_suspension_at", since.toString())));

        return contestations.currentFor(since)
                .orElseThrow(() -> new IllegalStateException(
                        "the row was written and cannot be read back"));
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Optional<Contestation> current() {
        // Empty for a business that is not suspended, which is every business
        // almost always: there is no message to show about a decision nobody
        // took, and the screen says so rather than showing an old one.
        return contestations.suspendedSince().flatMap(contestations::currentFor);
    }
}
