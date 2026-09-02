package com.balaaca.booking.adapters.outbound.persistence;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.domain.ServiceAddress;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaPosition;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaQuery;
import com.balaaca.booking.ports.outbound.AppointmentAgendaRepository;
import com.balaaca.catalog.ports.inbound.Fulfilment;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.StaffId;
import com.balaaca.sharedkernel.money.Currency;
import com.balaaca.sharedkernel.money.Money;
import com.balaaca.sharedkernel.phone.PhoneNumber;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The agenda query.
 *
 * <p>No provider predicate, deliberately. RLS supplies it, and writing one here
 * by hand would be a second place to forget it - on the one query whose whole
 * risk is returning somebody else's day. The database is the backstop that
 * holds when application code does not.
 *
 * <p>Keyset pagination, not OFFSET: an offset re-scans everything it skips, and
 * a row inserted between two pages shifts every later page by one, so a client
 * paging through a busy morning silently misses an appointment.
 */
@ApplicationScoped
public class AppointmentAgendaSqlRepository implements AppointmentAgendaRepository {

    private final EntityManager em;

    public AppointmentAgendaSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<AgendaEntry> page(AgendaQuery query) {
        Optional<AgendaPosition> after = query.after();

        List<Object[]> rows = em.createNativeQuery("""
                SELECT a.id, a.starts_at, a.ends_at, a.status, a.service_name,
                       a.customer_price_amount_minor, a.customer_price_currency,
                       c.full_name, c.phone_e164, c.email, a.customer_note,
                       a.staff_id, s.display_name, a.ready_by, a.ready_at,
                       l.slug, a.service_area, a.service_directions,
                       a.service_fulfilment
                  FROM appointments a
                  JOIN customers c ON c.id = a.customer_id
                  JOIN provider_staff s
                    ON s.provider_id = a.provider_id AND s.id = a.staff_id
                  -- Outer: a call-out whose customer named no commune is
                  -- ordinary, and an inner join would drop the appointment
                  -- rather than the field.
                  LEFT JOIN localities l ON l.id = a.service_locality_id
                 WHERE a.starts_at >= :from
                   AND (CAST(:to AS timestamptz) IS NULL
                        OR a.starts_at <= CAST(:to AS timestamptz))
                   AND (CAST(:staffId AS uuid) IS NULL
                        OR a.staff_id = CAST(:staffId AS uuid))
                   AND (CAST(:status AS varchar) IS NULL OR a.status = CAST(:status AS varchar))
                   AND (CAST(:status AS varchar) IS NOT NULL
                        OR a.status IN ('PENDING','CONFIRMED'))
                   -- The tie-break is part of the comparison, not an extra
                   -- filter: (starts_at, id) > (:at, :id) as a row comparison is
                   -- what makes the index seek land on the next row rather than
                   -- re-reading the instant it stopped on.
                   AND (CAST(:afterAt AS timestamptz) IS NULL
                        OR (a.starts_at, a.id) > (CAST(:afterAt AS timestamptz),
                                                  CAST(:afterId AS uuid)))
                 ORDER BY a.starts_at, a.id
                 LIMIT :limit
                """)
                .setParameter("from", Timestamp.from(query.from()))
                .setParameter("to", query.to().map(Timestamp::from).orElse(null))
                .setParameter("staffId", query.staffId().map(id -> id.value()).orElse(null))
                .setParameter("status", query.status().map(Enum::name).orElse(null))
                .setParameter("afterAt", after.map(p -> Timestamp.from(p.startsAt())).orElse(null))
                .setParameter("afterId", after.map(p -> p.id().value()).orElse(null))
                // One more than asked, so the caller can tell a full page from
                // the last one without a second query.
                .setParameter("limit", query.limit() + 1)
                .getResultList();

        return rows.stream().map(AppointmentAgendaSqlRepository::toEntry).toList();
    }

    private static AgendaEntry toEntry(Object[] r) {
        return new AgendaEntry(
                AppointmentId.of((UUID) r[0]),
                instant(r[1]),
                instant(r[2]),
                AppointmentStatus.valueOf((String) r[3]),
                (String) r[4],
                Money.ofMinor(((Number) r[5]).longValue(), Currency.of((String) r[6])),
                StaffId.of((UUID) r[11]),
                (String) r[12],
                new CustomerContact((String) r[7], new PhoneNumber((String) r[8]),
                                    Optional.ofNullable((String) r[9])),
                Fulfilment.valueOf((String) r[18]),
                Optional.ofNullable((String) r[10]).filter(n -> !n.isBlank()),
                Optional.ofNullable(r[13]).map(AppointmentAgendaSqlRepository::instant),
                Optional.ofNullable(r[14]).map(AppointmentAgendaSqlRepository::instant),
                address((String) r[15], (String) r[16], (String) r[17]));
    }

    /**
     * The address, or nothing at all. Keyed on the directions, which the schema
     * makes present exactly when the provider travels.
     */
    private static Optional<ServiceAddress> address(String locality, String area,
                                                    String directions) {
        return directions == null ? Optional.empty()
                : Optional.of(new ServiceAddress(Optional.ofNullable(locality),
                                                 Optional.ofNullable(area), directions));
    }

    /**
     * The driver's return type for a temporal column depends on its version and
     * settings, and a native query sees whatever it gives.
     */
    private static Instant instant(Object value) {
        if (value instanceof OffsetDateTime o) {
            return o.toInstant();
        }
        if (value instanceof Instant i) {
            return i;
        }
        return ((Timestamp) value).toInstant();
    }
}
