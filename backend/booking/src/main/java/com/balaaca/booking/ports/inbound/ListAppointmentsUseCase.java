package com.balaaca.booking.ports.inbound;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.StaffId;
import com.balaaca.sharedkernel.money.Money;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * The caller's own agenda.
 *
 * <p>The query carries no provider: the tenant is ambient, bound from the
 * verified subject before this is reached, and a parameter here would be an
 * identifier a caller could get wrong. What stops one provider reading another
 * is not this signature, though - it is the RLS policy on the table, which
 * holds even if every line of this module is wrong.
 */
public interface ListAppointmentsUseCase {

    AgendaPage list(AgendaQuery query);

    /**
     * @param from   earliest start to return
     * @param to     latest, or empty for everything after {@code from}. Without
     *               it the agenda is a ray, and a day view reads pages it throws
     *               away
     * @param staffId one person's chair, or empty for the whole business
     * @param status one status, or empty for the active ones
     * @param after  keyset position from the previous page, or empty for the first
     * @param limit  how many entries at most
     */
    record AgendaQuery(Instant from,
                       Optional<Instant> to,
                       Optional<StaffId> staffId,
                       Optional<AppointmentStatus> status,
                       Optional<AgendaPosition> after,
                       int limit) {
    }

    /**
     * Where the previous page stopped.
     *
     * <p>The start alone is not a position: two appointments can begin at the
     * same instant with different staff, and a cursor that could not tell them
     * apart would drop one of them or repeat it. The id breaks the tie.
     */
    record AgendaPosition(Instant startsAt, AppointmentId id) {
    }

    record AgendaEntry(AppointmentId id,
                       Instant startsAt,
                       Instant endsAt,
                       AppointmentStatus status,
                       String serviceName,
                       Money price,
                       StaffId staffId,
                       String staffName,
                       CustomerContact customer,
                       java.util.Optional<String> customerNote) {
    }

    /** @param next empty on the last page */
    record AgendaPage(List<AgendaEntry> entries, Optional<AgendaPosition> next) {
    }
}
