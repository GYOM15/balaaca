package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.ListStaffUseCase;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.UUID;

/**
 * No provider predicate: RLS supplies it, and provider_staff is tenant-scoped,
 * so this returns the caller's people and cannot return anyone else's.
 */
@ApplicationScoped
public class StaffSqlRepository implements ListStaffUseCase {

    private final EntityManager em;

    public StaffSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public List<StaffMember> currentStaff() {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, display_name, role, bookable, status
                  FROM provider_staff
                 ORDER BY (status = 'ACTIVE') DESC, display_name
                """).getResultList();

        return rows.stream().map(r -> new StaffMember(
                StaffId.of((UUID) r[0]), (String) r[1], (String) r[2],
                (Boolean) r[3], "ACTIVE".equals(r[4]))).toList();
    }
}
