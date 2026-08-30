package com.balaaca.booking.ports.inbound;

import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.sharedkernel.ids.AppointmentId;
import java.time.Instant;

/**
 * The rest of the appointment's life.
 *
 * <p>Cancellation has its own use case because it owes the outbox something the
 * others do not - a message to the customer, and the withdrawal of every
 * reminder. These four either move the slot or only change a word, and the
 * customer learns about them from the provider rather than from us.
 */
public interface MoveAppointmentUseCase {

    /** @param newStartsAt the requested start; everything else follows from the service */
    AgendaEntry reschedule(AppointmentId id, Instant newStartsAt);

    AgendaEntry confirm(AppointmentId id);

    AgendaEntry complete(AppointmentId id);

    AgendaEntry markNoShow(AppointmentId id);
}
