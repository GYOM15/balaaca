package com.balaaca.catalog.adapters.outbound.persistence;

import com.balaaca.catalog.ports.inbound.ManageServiceCompetenceUseCase.Performer;
import com.balaaca.catalog.ports.outbound.ServiceCompetenceRepository;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;

/**
 * The join, written and read.
 *
 * <p>Every statement here reads {@code provider_staff}, which belongs to
 * {@code providers}. That is deliberate and it is the exception the module rule
 * allows: the join table's own foreign keys already bind the two, and a port
 * call per row to resolve a display name would turn one query into as many
 * queries as the salon has chairs. The rows it reads are the ones its own
 * foreign key guarantees exist.
 *
 * <p>No statement carries a provider_id predicate except the inserts, which need
 * one for the column itself. RLS supplies the rest, and adding it by hand would
 * be a second place to forget it.
 */
@ApplicationScoped
public class ServiceCompetenceSqlRepository implements ServiceCompetenceRepository {

    private final EntityManager em;
    private final TenantContext tenantContext;

    public ServiceCompetenceSqlRepository(EntityManager em, TenantContext tenantContext) {
        this.em = em;
        this.tenantContext = tenantContext;
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<Performer> performers(ServiceOfferingId serviceOfferingId) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT s.id, s.display_name, s.bookable
                  FROM staff_service_offerings j
                  JOIN provider_staff s ON s.id = j.staff_id
                 WHERE j.service_offering_id = :offering
                 ORDER BY s.display_name, s.id
                """)
                .setParameter("offering", serviceOfferingId.value())
                .getResultList();

        return rows.stream()
                .map(r -> new Performer(StaffId.of((UUID) r[0]), (String) r[1], (Boolean) r[2]))
                .toList();
    }

    @Override
    public boolean offeringExists(ServiceOfferingId serviceOfferingId) {
        // Asked before a replace, so that a service belonging to somebody else
        // answers 404 rather than quietly writing nothing and reporting an
        // empty performer list as the new truth.
        return !em.createNativeQuery("SELECT 1 FROM service_offerings WHERE id = :id")
                .setParameter("id", serviceOfferingId.value())
                .getResultList().isEmpty();
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<StaffId> everyStaffId() {
        List<UUID> rows = em.createNativeQuery("SELECT id FROM provider_staff").getResultList();
        return rows.stream().map(StaffId::of).toList();
    }

    @Override
    public void replace(ServiceOfferingId serviceOfferingId, List<StaffId> staffIds) {
        // Delete then insert, in one transaction. An upsert would leave the
        // removed rows behind, and that is the half of this operation a
        // provider actually came for.
        em.createNativeQuery("DELETE FROM staff_service_offerings WHERE service_offering_id = :id")
                .setParameter("id", serviceOfferingId.value())
                .executeUpdate();

        if (staffIds.isEmpty()) {
            return;
        }
        UUID providerId = tenantContext.require().value();
        // unnest rather than a loop: one round trip whatever the size of the
        // team, and the composite foreign key refuses any id that is not this
        // provider's before a single row lands.
        em.createNativeQuery("""
                INSERT INTO staff_service_offerings (provider_id, staff_id, service_offering_id)
                SELECT :providerId, s, :offering FROM unnest(CAST(:staff AS uuid[])) AS s
                """)
                .setParameter("providerId", providerId)
                .setParameter("offering", serviceOfferingId.value())
                .setParameter("staff", staffIds.stream().map(id -> id.value().toString())
                        .toArray(String[]::new))
                .executeUpdate();
    }

    @Override
    public void grantWholeTeam(ServiceOfferingId serviceOfferingId) {
        // ON CONFLICT DO NOTHING on both grants: they are called on creation,
        // and a retried creation must not fail on a row it wrote itself.
        em.createNativeQuery("""
                INSERT INTO staff_service_offerings (provider_id, staff_id, service_offering_id)
                SELECT s.provider_id, s.id, :offering FROM provider_staff s
                ON CONFLICT DO NOTHING
                """)
                .setParameter("offering", serviceOfferingId.value())
                .executeUpdate();
    }

    @Override
    public void grantWholeCatalogue(StaffId staffId) {
        em.createNativeQuery("""
                INSERT INTO staff_service_offerings (provider_id, staff_id, service_offering_id)
                SELECT o.provider_id, :staff, o.id FROM service_offerings o
                ON CONFLICT DO NOTHING
                """)
                .setParameter("staff", staffId.value())
                .executeUpdate();
    }
}
