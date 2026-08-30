package com.balaaca.scheduling.adapters.outbound.persistence;

import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.Closure;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.LocalTimeRange;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.WeeklySegment;
import com.balaaca.scheduling.ports.outbound.AvailabilityAdminRepository;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.sql.Date;
import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The declared week, in SQL.
 *
 * <p>Reads and the delete carry no provider predicate: RLS supplies it, so a
 * staff member or a closure that is not the caller's is invisible rather than
 * forbidden. The inserts are the exception - a native insert bypasses any tenant
 * filter, so provider_id comes from TenantContext and the policy's WITH CHECK is
 * the backstop.
 */
@ApplicationScoped
public class AvailabilityAdminSqlRepository implements AvailabilityAdminRepository {

    private final EntityManager em;
    private final TenantContext tenantContext;

    public AvailabilityAdminSqlRepository(EntityManager em, TenantContext tenantContext) {
        this.em = em;
        this.tenantContext = tenantContext;
    }

    @Override
    @SuppressWarnings("unchecked")
    public boolean staffExists(StaffId staffId) {
        return !em.createNativeQuery("SELECT 1 FROM provider_staff WHERE id = :id")
                .setParameter("id", staffId.value())
                .getResultList().isEmpty();
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<WeeklySegment> segmentsOf(StaffId staffId) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT day_of_week, start_time, end_time, effective_from, effective_to
                  FROM availability_rules
                 WHERE staff_id = :staffId
                 ORDER BY day_of_week, start_time
                """).setParameter("staffId", staffId.value()).getResultList();

        return rows.stream().map(r -> new WeeklySegment(
                ((Number) r[0]).intValue(),
                localTime(r[1]), localTime(r[2]),
                Optional.ofNullable(r[3]).map(AvailabilityAdminSqlRepository::localDate),
                Optional.ofNullable(r[4]).map(AvailabilityAdminSqlRepository::localDate))).toList();
    }

    @Override
    public List<WeeklySegment> replaceSegments(StaffId staffId, List<WeeklySegment> segments) {
        // Delete then insert, inside the caller's transaction. A week is one
        // thing a provider edits, so it is replaced as one: reconciling row by
        // row would leave a moment where the week is neither the old one nor
        // the new one, and a booking arriving then would be judged against it.
        em.createNativeQuery("DELETE FROM availability_rules WHERE staff_id = :staffId")
                .setParameter("staffId", staffId.value())
                .executeUpdate();

        UUID providerId = tenantContext.require().value();
        for (WeeklySegment s : segments) {
            em.createNativeQuery("""
                    INSERT INTO availability_rules (
                        id, provider_id, staff_id, day_of_week, start_time, end_time,
                        effective_from, effective_to)
                    VALUES (:id, :providerId, :staffId, :day, CAST(:start AS time),
                            CAST(:end AS time), CAST(:from AS date), CAST(:to AS date))
                    """)
                    .setParameter("id", UUID.randomUUID())
                    .setParameter("providerId", providerId)
                    .setParameter("staffId", staffId.value())
                    .setParameter("day", s.dayOfWeek())
                    .setParameter("start", s.start().toString())
                    .setParameter("end", s.end().toString())
                    .setParameter("from", s.effectiveFrom().map(LocalDate::toString).orElse(null))
                    .setParameter("to", s.effectiveTo().map(LocalDate::toString).orElse(null))
                    .executeUpdate();
        }
        return segmentsOf(staffId);
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<Closure> closures(StaffId staffId, LocalDate from, LocalDate to) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, override_date, kind, start_time, end_time, reason
                  FROM availability_overrides
                 WHERE staff_id = :staffId AND override_date BETWEEN :from AND :to
                 ORDER BY override_date
                """)
                .setParameter("staffId", staffId.value())
                .setParameter("from", Date.valueOf(from))
                .setParameter("to", Date.valueOf(to))
                .getResultList();

        return rows.stream().map(r -> new Closure(
                Optional.of((UUID) r[0]),
                staffId,
                localDate(r[1]),
                "CLOSED".equals(r[2])
                        ? Optional.<LocalTimeRange>empty()
                        : Optional.of(new LocalTimeRange(localTime(r[3]), localTime(r[4]))),
                Optional.ofNullable((String) r[5]))).toList();
    }

    @Override
    public Closure insertClosure(UUID id, Closure closure) {
        em.createNativeQuery("""
                INSERT INTO availability_overrides (
                    id, provider_id, staff_id, override_date, kind, start_time, end_time, reason)
                VALUES (:id, :providerId, :staffId, CAST(:date AS date), :kind,
                        CAST(:start AS time), CAST(:end AS time), :reason)
                """)
                .setParameter("id", id)
                .setParameter("providerId", tenantContext.require().value())
                .setParameter("staffId", closure.staffId().value())
                .setParameter("date", closure.date().toString())
                .setParameter("kind", closure.window().isPresent() ? "CUSTOM_HOURS" : "CLOSED")
                .setParameter("start", closure.window().map(w -> w.start().toString()).orElse(null))
                .setParameter("end", closure.window().map(w -> w.end().toString()).orElse(null))
                .setParameter("reason", closure.reason().orElse(null))
                .executeUpdate();

        return new Closure(Optional.of(id), closure.staffId(), closure.date(),
                           closure.window(), closure.reason());
    }

    @Override
    public boolean deleteClosure(UUID id) {
        return em.createNativeQuery("DELETE FROM availability_overrides WHERE id = :id")
                .setParameter("id", id)
                .executeUpdate() == 1;
    }

    private static LocalTime localTime(Object value) {
        return value instanceof LocalTime t ? t : ((Time) value).toLocalTime();
    }

    private static LocalDate localDate(Object value) {
        return value instanceof LocalDate d ? d : ((Date) value).toLocalDate();
    }
}
