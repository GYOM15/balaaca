package com.balaaca.booking.ports.inbound;

import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.sharedkernel.ids.CustomerId;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * The provider's own address book.
 *
 * <p>{@code customers} has filled up on every booking since the table existed
 * and nothing has ever read it back: a salon could not see who its customers
 * were, could not find the person who called yesterday, and could not tell a
 * regular from somebody's first visit. The rows were there the whole time.
 *
 * <p>In booking rather than in providers because both halves live here - the
 * table is written by the booking path, and a customer without their history is
 * a phone number. A port call per appointment to assemble that would be one
 * query per row.
 */
public interface ListCustomersUseCase {

    /**
     * @param contains part of a name or a phone number. A salon looking somebody
     *                 up has one of the two and rarely the spelling
     */
    CustomerPage list(Optional<String> contains, Optional<CustomerId> after, int limit);

    /** @throws com.balaaca.booking.domain.BookingExceptions.CustomerNotFoundException */
    CustomerDetail detail(CustomerId id);

    /**
     * The provider's own note about this person. Never shown to the customer,
     * and never sent anywhere: it is the line a salon writes to remember that
     * somebody is allergic to a product, and it belongs to them.
     *
     * @throws com.balaaca.booking.domain.BookingExceptions.CustomerNotFoundException
     */
    CustomerDetail replaceNotes(CustomerId id, Optional<String> notes);

    /**
     * @param visits how many appointments this person has, in any state. A
     *               count that hid cancellations would make a serial canceller
     *               look like a new customer
     * @param lastVisit the most recent appointment START, past or future -
     *                  which is what a salon means by "when did I last see
     *                  them", and empty only for somebody who has never booked
     */
    record CustomerSummary(CustomerId id, CustomerContact contact,
                           int visits, Optional<Instant> lastVisit) {
    }

    record CustomerDetail(CustomerId id, CustomerContact contact,
                          Optional<String> notes, int visits,
                          Optional<Instant> lastVisit,
                          List<Visit> history) {
    }

    /** One line of the history: enough to recognise it, not the whole agenda row. */
    record Visit(Instant startsAt, String serviceName, String status,
                 String staffName) {
    }

    /** @param next empty on the last page */
    record CustomerPage(List<CustomerSummary> entries, Optional<CustomerId> next) {
    }
}
