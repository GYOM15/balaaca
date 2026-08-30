package com.balaaca.booking.application;

import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase;
import com.balaaca.booking.ports.outbound.AppointmentAgendaRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Optional;

/**
 * Reads a page of the caller's agenda.
 *
 * <p>Transactional even though it only reads: the tenant reaches PostgreSQL as
 * a SET LOCAL, which is discarded outside a transaction, and this query would
 * then run with no tenant bound - returning nothing, which reads as "you have
 * no appointments" rather than failing.
 */
@ApplicationScoped
public class ListAppointmentsService implements ListAppointmentsUseCase {

    private final AppointmentAgendaRepository agenda;

    public ListAppointmentsService(AppointmentAgendaRepository agenda) {
        this.agenda = agenda;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaPage list(AgendaQuery query) {
        List<AgendaEntry> fetched = agenda.page(query);

        // The repository fetches one extra. Its presence is what says there is
        // another page; asking with a COUNT would cost a second scan to learn
        // one bit.
        boolean more = fetched.size() > query.limit();
        List<AgendaEntry> entries = more ? fetched.subList(0, query.limit()) : fetched;

        Optional<AgendaPosition> next = more
                ? Optional.of(position(entries.get(entries.size() - 1)))
                : Optional.empty();

        return new AgendaPage(List.copyOf(entries), next);
    }

    private static AgendaPosition position(AgendaEntry last) {
        return new AgendaPosition(last.startsAt(), last.id());
    }
}
