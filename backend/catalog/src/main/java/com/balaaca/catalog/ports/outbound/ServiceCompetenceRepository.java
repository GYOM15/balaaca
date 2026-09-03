package com.balaaca.catalog.ports.outbound;

import com.balaaca.catalog.ports.inbound.ManageServiceCompetenceUseCase.Performer;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import java.util.List;
import java.util.UUID;

/** The join between a team and a catalogue. */
public interface ServiceCompetenceRepository {

    List<Performer> performers(ServiceOfferingId serviceOfferingId);

    boolean offeringExists(ServiceOfferingId serviceOfferingId);

    /** The provider's whole team, whatever their status. */
    List<StaffId> everyStaffId();

    void replace(ServiceOfferingId serviceOfferingId, List<StaffId> staffIds);

    void grantWholeTeam(ServiceOfferingId serviceOfferingId);

    void grantWholeCatalogue(StaffId staffId);
}
