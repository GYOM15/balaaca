package com.balaaca.catalog.ports.inbound;

import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import java.util.List;
import java.util.UUID;

/**
 * Who in the team performs which service.
 *
 * <p>Strict: a row means the person performs it, and its absence means they do
 * not. That is the loud failure rather than the quiet one - a service nobody
 * can take is visible on the first booking attempt, while an exclusion somebody
 * forgot to write sends a customer to the wrong chair and tells nobody.
 *
 * <p>Which is why both grants below exist. A provider who never opens this
 * screen must never notice it: a new service is granted to everybody, a new
 * colleague is granted everything, and the screen is then the way to REMOVE
 * somebody - which is how a provider thinks about it anyway.
 *
 * <p>It lives in catalog because the service is the thing being qualified.
 * {@code providers} calls the grant when it hires; {@code booking} and
 * {@code scheduling} read the join in their own queries, which is the one thing
 * that has to be fast.
 */
public interface ManageServiceCompetenceUseCase {

    /** Who can take a booking for this service, in a stable order. */
    List<Performer> performers(ServiceOfferingId serviceOfferingId);

    /**
     * The whole set, for the same reason opening hours are replaced a week at a
     * time: a partial edit leaves the question of what happened to the names
     * nobody mentioned.
     *
     * @throws com.balaaca.catalog.domain.ServiceOfferingNotFoundException when
     *         the service is not the caller's, or does not exist
     * @throws com.balaaca.catalog.domain.UnknownPerformerException when a named
     *         person is not on this provider's team
     */
    List<Performer> replacePerformers(ServiceOfferingId serviceOfferingId, List<StaffId> staffIds);

    /** A new service, granted to the whole team. Called on creation. */
    void grantWholeTeam(ServiceOfferingId serviceOfferingId);

    /** A new colleague, granted the whole catalogue. Called on hiring. */
    void grantWholeCatalogue(StaffId staffId);

    /**
     * @param bookable false for somebody the provider keeps off the customer's
     *                 list. They still hold the competence - a receptionist who
     *                 stops taking bookings has not forgotten how to braid -
     *                 and the booking path filters on it separately
     */
    record Performer(StaffId staffId, String displayName, boolean bookable) {
    }
}
