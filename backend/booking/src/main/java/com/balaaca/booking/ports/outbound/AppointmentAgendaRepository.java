package com.balaaca.booking.ports.outbound;

import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaQuery;
import java.util.List;

/**
 * Reads the agenda. Separate from {@link AppointmentRepository}, which writes
 * it: the two change for different reasons, and a booking that must never lose
 * its exclusion constraint has no business sharing an interface with a listing
 * that will grow filters for years.
 */
public interface AppointmentAgendaRepository {

    /**
     * One more than asked for, so the caller can tell a full page from the last
     * one without a second query or a count.
     */
    List<AgendaEntry> page(AgendaQuery query);

    /**
     * How many match, ignoring the cursor and the limit.
     *
     * <p>Its own statement rather than a window function beside the rows: the
     * page reads one extra row to learn whether there is a next one, which
     * costs nothing, while a COUNT OVER () on the same query would be computed
     * for every row returned. Two scans, each doing one job, on an index the
     * page already uses.
     *
     * <p>The cursor is deliberately not part of it. A total that shrank as the
     * caller paged forward would be a different number on every page, and the
     * one thing a caller wants it for is a badge that does not move.
     */
    int count(AgendaQuery query);
}
