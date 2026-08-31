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
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads the provider's declared hours.
 *
 * <p>Queries against tenant-scoped tables carry no provider predicate: RLS
 * supplies it, and adding one by hand would be a second place to forget it.
 *
 * <p>{@code providers} is the exception, and it is not optional. That table
 * carries TWO policies, OR'd: the tenant one, and a public-read one so the hub
 * can list published providers without a tenant bound. With a tenant bound a
 * bare SELECT therefore returns my provider PLUS every published provider, and
 * "the current provider" stops being a single row. Anything meaning "mine" says
 * so explicitly.
 */
@ApplicationScoped
public class AvailabilitySqlRepository implements AvailabilityRepository {

    // Every optional staff filter casts its parameter. PostgreSQL cannot infer
    // the type of a parameter whose only unambiguous use is beside IS NULL, and
    // refuses the statement with 42P18 rather than guessing.

    private final EntityManager em;

    public AvailabilitySqlRepository(EntityManager em) {
        this.em = em;
    }

    // The driver's return type for a temporal column depends on its version and
    // settings: modern pgjdbc hands back java.time values, older paths hand back
    // java.sql ones. A native query sees whatever it gives, so these accept both
    // rather than casting to one and failing at runtime on the other.
    private static LocalTime localTime(Object value) {
        return value instanceof LocalTime t ? t : ((java.sql.Time) value).toLocalTime();
    }

    private static LocalDate localDate(Object value) {
        return value instanceof LocalDate d ? d : ((java.sql.Date) value).toLocalDate();
    }

    private static Instant instant(Object value) {
        if (value instanceof OffsetDateTime o) {
            return o.toInstant();
        }
        if (value instanceof Instant i) {
            return i;
        }
        return ((Timestamp) value).toInstant();
    }

    @Override
    public ZoneId zoneOfCurrentProvider() {
        return ZoneId.of((String) em.createNativeQuery(
                "SELECT timezone FROM providers WHERE id = app_current_provider()")
                .getSingleResult());
    }

    @Override
    @SuppressWarnings("unchecked")
    public BookingPolicy policyOfCurrentProvider() {
        Object[] r = (Object[]) em.createNativeQuery("""
                SELECT slot_granularity_minutes, min_lead_time_minutes, max_advance_days
                  FROM providers WHERE id = app_current_provider()
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
                 WHERE (CAST(:staffId AS uuid) IS NULL OR staff_id = CAST(:staffId AS uuid))
                 ORDER BY day_of_week, start_time
                """)
                .setParameter("staffId", staffId.map(s -> s.value()).orElse(null))
                .getResultList();

        return rows.stream().map(r -> new AvailabilityRule(
                        // ISO day numbering: 1 is Monday, which DayOfWeek shares.
                        DayOfWeek.of(((Number) r[0]).intValue()),
                        new LocalWindow(localTime(r[1]), localTime(r[2])),
                        Optional.ofNullable(r[3]).map(AvailabilitySqlRepository::localDate),
                        Optional.ofNullable(r[4]).map(AvailabilitySqlRepository::localDate)))
                .toList();
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<AvailabilityOverride> overridesFor(Optional<StaffId> staffId,
                                                   LocalDate from, LocalDate to) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT override_date, kind, start_time, end_time
                  FROM availability_overrides
                 WHERE (CAST(:staffId AS uuid) IS NULL OR staff_id = CAST(:staffId AS uuid))
                   AND override_date BETWEEN :from AND :to
                """)
                .setParameter("staffId", staffId.map(s -> s.value()).orElse(null))
                .setParameter("from", java.sql.Date.valueOf(from))
                .setParameter("to", java.sql.Date.valueOf(to))
                .getResultList();

        return rows.stream().map(r -> {
            LocalDate date = localDate(r[0]);
            return "CLOSED".equals(r[1])
                    ? AvailabilityOverride.closed(date)
                    : AvailabilityOverride.customHours(date,
                            new LocalWindow(localTime(r[2]), localTime(r[3])));
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
                   AND (CAST(:staffId AS uuid) IS NULL OR staff_id = CAST(:staffId AS uuid))
                   AND blocked_range && tstzrange(:from, :until, '[)')
                """)
                .setParameter("staffId", staffId.map(s -> s.value()).orElse(null))
                .setParameter("from", Timestamp.from(window.from()))
                .setParameter("until", Timestamp.from(window.until()))
                .getResultList();

        return rows.stream()
                .map(r -> new InstantRange(instant(r[0]), instant(r[1])))
                .toList();
    }
    @Override
    @SuppressWarnings("unchecked")
    public List<StaffId> bookableStaff() {
        // The same predicate the public staff list uses. If the two disagreed,
        // a customer would be offered a name whose calendar is never consulted,
        // or denied one whose is.
        List<UUID> rows = em.createNativeQuery("""
                SELECT id FROM provider_staff
                 WHERE status = 'ACTIVE' AND bookable
                 ORDER BY id
                """).getResultList();

        return rows.stream().map(StaffId::of).toList();
    }

}
