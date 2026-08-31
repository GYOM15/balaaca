package com.balaaca.catalog.adapters.outbound.persistence;

import com.balaaca.catalog.ports.inbound.ManageServicePhotosUseCase.Photo;
import com.balaaca.catalog.ports.outbound.ServicePhotoRepository;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The photographs on a service.
 *
 * <p>No provider predicate anywhere except the insert, which needs one for the
 * column itself. RLS supplies the rest, and the public read policy is what lets
 * a stranger see them on a page while a suspended salon's disappear with
 * everything else of theirs.
 */
@ApplicationScoped
public class ServicePhotoSqlRepository implements ServicePhotoRepository {

    private final EntityManager em;
    private final TenantContext tenant;

    public ServicePhotoSqlRepository(EntityManager em, TenantContext tenant) {
        this.em = em;
        this.tenant = tenant;
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<Photo> of(ServiceOfferingId serviceOfferingId) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, stored_name, sort_order
                  FROM service_photos
                 WHERE service_offering_id = :offering
                 ORDER BY sort_order
                """).setParameter("offering", serviceOfferingId.value()).getResultList();

        return rows.stream()
                .map(r -> new Photo((UUID) r[0], (String) r[1], ((Number) r[2]).intValue()))
                .toList();
    }

    @Override
    public boolean offeringExists(ServiceOfferingId serviceOfferingId) {
        return !em.createNativeQuery("SELECT 1 FROM service_offerings WHERE id = :id")
                .setParameter("id", serviceOfferingId.value())
                .getResultList().isEmpty();
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<Photo> add(ServiceOfferingId serviceOfferingId, String storedName) {
        UUID providerId = tenant.require().value();
        UUID id = UUID.randomUUID();

        // The slot is chosen by the statement, not by a count read first: two
        // uploads racing would both read four and both write slot four, and the
        // unique index would refuse one of them with a constraint name. The
        // generate_series finds the lowest free slot inside the same statement
        // that takes it, so the loser gets the next one instead of an error.
        List<Object[]> rows = em.createNativeQuery("""
                INSERT INTO service_photos
                    (id, provider_id, service_offering_id, stored_name, sort_order)
                SELECT :id, :providerId, :offering, :name, slot
                  FROM generate_series(0, 4) AS slot
                 WHERE NOT EXISTS (SELECT 1 FROM service_photos
                                    WHERE service_offering_id = :offering
                                      AND sort_order = slot)
                 ORDER BY slot
                 LIMIT 1
                RETURNING id, stored_name, sort_order
                """)
                .setParameter("id", id)
                .setParameter("providerId", providerId)
                .setParameter("offering", serviceOfferingId.value())
                .setParameter("name", storedName)
                .getResultList();

        // No row means every slot was taken: the SELECT found nothing to insert.
        return rows.stream().findFirst()
                .map(r -> new Photo((UUID) r[0], (String) r[1], ((Number) r[2]).intValue()));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<String> remove(ServiceOfferingId serviceOfferingId, UUID photoId) {
        // The offering is in the predicate as well as the id: a photograph id
        // from another of the caller's own services is a mistake worth refusing
        // rather than quietly obeying, and another provider's is invisible.
        List<String> removed = em.createNativeQuery("""
                DELETE FROM service_photos
                 WHERE id = :id AND service_offering_id = :offering
                RETURNING stored_name
                """)
                .setParameter("id", photoId)
                .setParameter("offering", serviceOfferingId.value())
                .getResultList();

        // The freed slot is deliberately NOT backfilled. Renumbering would move
        // every other photograph's position, and the first one is the picture
        // that represents the service in a list - a provider who chose it would
        // find it changed because they deleted something else.
        return removed.stream().findFirst();
    }
}
