package com.balaaca.booking.ports.inbound;

import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.sharedkernel.ids.AppointmentId;
import java.util.Optional;

/**
 * Cancels one of the caller's appointments.
 *
 * <p>No provider parameter and no version: the tenant is ambient, and the
 * contract carries nothing for a caller to state an expected version with. What
 * makes the transition safe is the statement itself, which names the states it
 * accepts.
 */
public interface CancelAppointmentUseCase {

    /** @return the appointment as it now stands */
    AgendaEntry cancel(AppointmentId id, Optional<String> reason);
}
