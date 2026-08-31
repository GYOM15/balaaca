package com.balaaca.catalog.application;

import com.balaaca.catalog.domain.ServiceOfferingNotFoundException;
import com.balaaca.catalog.domain.UnknownPerformerException;
import com.balaaca.catalog.ports.inbound.ManageServiceCompetenceUseCase;
import com.balaaca.catalog.ports.outbound.ServiceCompetenceRepository;
import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditOutcome;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Who performs what, read and written. */
@ApplicationScoped
public class ManageServiceCompetenceService implements ManageServiceCompetenceUseCase {

    private final ServiceCompetenceRepository competences;
    private final AuditTrail audit;

    public ManageServiceCompetenceService(ServiceCompetenceRepository competences,
                                          AuditTrail audit) {
        this.competences = competences;
        this.audit = audit;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<Performer> performers(ServiceOfferingId serviceOfferingId) {
        requireOffering(serviceOfferingId);
        return competences.performers(serviceOfferingId);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<Performer> replacePerformers(ServiceOfferingId serviceOfferingId,
                                             List<StaffId> staffIds) {
        requireOffering(serviceOfferingId);

        // Checked before anything is written, so a refusal leaves the service
        // performed by exactly who it was performed by. The foreign key would
        // catch a foreign id too, but as a 500 naming a constraint.
        var team = new HashSet<>(competences.everyStaffId());
        staffIds.stream().filter(id -> !team.contains(id)).findFirst()
                .ifPresent(id -> { throw new UnknownPerformerException(id); });

        // Distinct, order preserved: a client that sent the same person twice
        // meant them once, and the primary key would otherwise refuse the whole
        // request over a duplicate that changes nothing.
        competences.replace(serviceOfferingId, staffIds.stream().distinct().toList());

        List<Performer> now = competences.performers(serviceOfferingId);

        // Worth a trail entry: this is the setting that decides who a customer
        // is sent to, and "nobody performs this any more" is the kind of change
        // that gets noticed a week later.
        audit.record(new AuditEvent("SERVICE_PERFORMERS_REPLACED", "service_offering",
                Optional.of(serviceOfferingId.value().toString()), AuditOutcome.SUCCESS,
                Map.of("performers", String.valueOf(now.size()))));

        return now;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public void grantWholeTeam(ServiceOfferingId serviceOfferingId) {
        competences.grantWholeTeam(serviceOfferingId);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public void grantWholeCatalogue(StaffId staffId) {
        competences.grantWholeCatalogue(staffId);
    }

    private void requireOffering(ServiceOfferingId id) {
        if (!competences.offeringExists(id)) {
            throw new ServiceOfferingNotFoundException(id.value());
        }
    }
}
