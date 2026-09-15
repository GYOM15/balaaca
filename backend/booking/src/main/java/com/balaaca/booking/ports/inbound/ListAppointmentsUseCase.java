package com.balaaca.booking.ports.inbound;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.ContactChannel;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.domain.ServiceAddress;
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
                       /**
                        * The ways of working asked for, matched against what
                        * was FROZEN on the appointment. Empty is no filter:
                        * nobody asks for an appointment that happens no way at
                        * all, so the value is free to mean the absence of the
                        * question - the same reading `Fulfilments` takes in the
                        * directory.
                        */
                       java.util.List<String> fulfilments,
                       Optional<AgendaPosition> after,
                       int limit) {

        public AgendaQuery {
            fulfilments = java.util.List.copyOf(fulfilments);
        }
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
                       /**
                        * How this booking is fulfilled, as the customer chose
                        * it. It cannot be inferred from the presence of
                        * readyBy or serviceAddress any more: the service it was
                        * booked from may publish all three modes, and this
                        * appointment is only one of them.
                        */
                       com.balaaca.catalog.ports.inbound.Fulfilment fulfilment,
                       java.util.Optional<String> customerNote,
                       /**
                        * Both empty on an on-site appointment: the customer sat
                        * down and left with the result, so there is nothing to
                        * promise and nothing to declare ready.
                        */
                       java.util.Optional<Instant> readyBy,
                       java.util.Optional<Instant> readyAt,
                       /**
                        * Where to go, on a call-out. Empty on every appointment
                        * that happens at the shop - and empty rather than blank,
                        * because a shop appointment carries no address at all.
                        */
                       java.util.Optional<ServiceAddress> serviceAddress,
                       /**
                        * How the customer asked to be reached about THIS
                        * appointment, as frozen when it was booked.
                        *
                        * <p>Read off the appointment and never off the customer
                        * row, which holds one entry per telephone number and
                        * would answer with whatever the person's most recent
                        * booking said. A cancellation notice owed for a
                        * September appointment goes the way September agreed.
                        */
                       ContactChannel preferredChannel) {
    }

    /** @param next empty on the last page */
    /**
     * @param total how many match across every page, which is NOT the size of
     *              `entries`. A count taken from the rows is a lie the moment
     *              there is a second page, and the dashboard was taking
     *              several: a badge counting a request for two hundred told a
     *              busy salon it had exactly two hundred, for ever.
     */
    record AgendaPage(List<AgendaEntry> entries, Optional<AgendaPosition> next, int total) {
    }
}
