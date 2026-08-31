package com.balaaca.booking.ports.inbound;

import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.StaffId;
import java.time.Instant;
import java.util.Optional;

/**
 * The rest of the appointment's life.
 *
 * <p>Cancellation has its own use case because it owes the outbox something the
 * others do not - a message to the customer, and the withdrawal of every
 * reminder. These four either move the slot or only change a word, and the
 * customer learns about them from the provider rather than from us.
 */
public interface MoveAppointmentUseCase {

    /**
     * Moves an appointment to another slot, another chair, or both.
     *
     * @param newStartsAt the requested start; everything else about time
     *                    follows from the service the appointment carries
     * @param newStaffId  empty leaves it with the colleague it already has. A
     *                    move between chairs at the same instant is a real
     *                    request and not a no-op: the exclusion constraint keys
     *                    on the staff member, so the appointment is being taken
     *                    off one resource and put onto another
     */
    AgendaEntry reschedule(AppointmentId id, Instant newStartsAt, Optional<StaffId> newStaffId);

    AgendaEntry confirm(AppointmentId id);

    AgendaEntry complete(AppointmentId id);

    AgendaEntry markNoShow(AppointmentId id);
}
