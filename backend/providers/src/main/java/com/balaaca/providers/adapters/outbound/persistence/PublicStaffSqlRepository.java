package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.LookupPublicStaffUseCase;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.UUID;

/**
 * Who a customer may ask for, in SQL.
 *
 * <p>Two columns, chosen once. The role is not among them, so a customer cannot
 * tell the owner from an employee - which is not secrecy but accuracy: it is not
 * a fact about the service being booked.
 *
 * <p>The predicate matches the one the slot calculator uses for the same people
 * (see AvailabilityAdminSqlRepository). If the two disagreed, a customer would
 * be offered a name whose calendar is empty, or denied one whose is not.
 */
@ApplicationScoped
public class PublicStaffSqlRepository implements LookupPublicStaffUseCase {

    private final EntityManager em;

    public PublicStaffSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public List<BookableStaff> bookableStaff() {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, display_name
                  FROM provider_staff
                 WHERE status = 'ACTIVE' AND bookable
                 ORDER BY display_name, id
                """).getResultList();

        return rows.stream()
                .map(r -> new BookableStaff(StaffId.of((UUID) r[0]), (String) r[1]))
                .toList();
    }
}
