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
}
