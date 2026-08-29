package com.balaaca.scheduling.adapters.outbound.persistence;

import com.balaaca.scheduling.domain.AvailabilityOverride;
import com.balaaca.scheduling.domain.AvailabilityRule;
import com.balaaca.scheduling.domain.BookingPolicy;
import com.balaaca.scheduling.domain.InstantRange;
import com.balaaca.scheduling.domain.LocalWindow;
import com.balaaca.scheduling.ports.outbound.AvailabilityRepository;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

/**
 * Reads the provider's declared hours. No query here carries a provider
 * predicate: RLS supplies it, and adding one by hand would be a second place to
 * forget it.
 */
@ApplicationScoped
public class AvailabilityPanacheRepository implements AvailabilityRepository {

    private final EntityManager em;

    public AvailabilityPanacheRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    public ZoneId zoneOfCurrentProvider() {
        return ZoneId.of((String) em.createNativeQuery("SELECT timezone FROM providers")
                .getSingleResult());
    }

    @Override
    @SuppressWarnings("unchecked")
    public BookingPolicy policyOfCurrentProvider() {
        Object[] r = (Object[]) em.createNativeQuery("""
                SELECT slot_granularity_minutes, min_lead_time_minutes, max_advance_days
                  FROM providers
                """).getSingleResult();
        return new BookingPolicy(
                Duration.ofMinutes(((Number) r[0]).longValue()),
                Duration.ofMinutes(((Number) r[1]).longValue()),
                ((Number) r[2]).intValue());
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<AvailabilityRule> rulesFor(Optional<StaffId> staffId) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT day_of_week, start_time, end_time, effective_from, effective_to
                  FROM availability_rules
                 WHERE (:staffId IS NULL OR staff_id = :staffId)
                 ORDER BY day_of_week, start_time
                """)
                .setParameter("staffId", staffId.map(s -> s.value()).orElse(null))
                .getResultList();

        return rows.stream().map(r -> new AvailabilityRule(
                        // ISO day numbering: 1 is Monday, which DayOfWeek shares.
                        DayOfWeek.of(((Number) r[0]).intValue()),
                        new LocalWindow(((Time) r[1]).toLocalTime(), ((Time) r[2]).toLocalTime()),
                        Optional.ofNullable((java.sql.Date) r[3]).map(java.sql.Date::toLocalDate),
                        Optional.ofNullable((java.sql.Date) r[4]).map(java.sql.Date::toLocalDate)))
                .toList();
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<AvailabilityOverride> overridesFor(Optional<StaffId> staffId,
                                                   LocalDate from, LocalDate to) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT override_date, kind, start_time, end_time
                  FROM availability_overrides
                 WHERE (:staffId IS NULL OR staff_id = :staffId)
                   AND override_date BETWEEN :from AND :to
                """)
                .setParameter("staffId", staffId.map(s -> s.value()).orElse(null))
                .setParameter("from", java.sql.Date.valueOf(from))
                .setParameter("to", java.sql.Date.valueOf(to))
                .getResultList();

        return rows.stream().map(r -> {
            LocalDate date = ((java.sql.Date) r[0]).toLocalDate();
            return "CLOSED".equals(r[1])
                    ? AvailabilityOverride.closed(date)
                    : AvailabilityOverride.customHours(date, new LocalWindow(
                            ((Time) r[2]).toLocalTime(), ((Time) r[3]).toLocalTime()));
        }).toList();
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<InstantRange> busyRanges(Optional<StaffId> staffId, InstantRange window) {
        // lower() and upper() rather than the range itself: the driver has no
        // mapping for tstzrange, and the two bounds are all the calculator needs.
        List<Object[]> rows = em.createNativeQuery("""
                SELECT lower(blocked_range), upper(blocked_range)
                  FROM appointments
                 WHERE status IN ('PENDING','CONFIRMED')
                   AND (:staffId IS NULL OR staff_id = :staffId)
                   AND blocked_range && tstzrange(:from, :until, '[)')
                """)
                .setParameter("staffId", staffId.map(s -> s.value()).orElse(null))
                .setParameter("from", Timestamp.from(window.from()))
                .setParameter("until", Timestamp.from(window.until()))
                .getResultList();

        return rows.stream()
                .map(r -> new InstantRange(((Timestamp) r[0]).toInstant(),
                                           ((Timestamp) r[1]).toInstant()))
                .toList();
    }
}
