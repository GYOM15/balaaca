package com.balaaca.booking.application;

import com.balaaca.booking.domain.BookingExceptions.CustomerNotFoundException;
import com.balaaca.booking.ports.inbound.ListCustomersUseCase;
import com.balaaca.booking.ports.outbound.CustomerRepository;
import com.balaaca.sharedkernel.ids.CustomerId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Optional;

/**
 * The address book, read.
 *
 * <p>Transactional even for the reads: the tenant reaches PostgreSQL as a SET
 * LOCAL, discarded outside a transaction, so an untransacted query would run
 * with no tenant bound and return nothing - which reads as a salon with no
 * customers rather than as a failure.
 */
@ApplicationScoped
public class ListCustomersService implements ListCustomersUseCase {

    private final CustomerRepository customers;

    public ListCustomersService(CustomerRepository customers) {
        this.customers = customers;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public CustomerPage list(Optional<String> contains, Optional<CustomerId> after, int limit) {
        // Two characters, like the directory search: below that it matches most
        // of the address book and answers nothing.
        Optional<String> term = contains.map(String::trim).filter(t -> t.length() >= 2);

        List<CustomerSummary> fetched = customers.page(term, after, limit);
        boolean more = fetched.size() > limit;
        List<CustomerSummary> entries = more ? fetched.subList(0, limit) : fetched;

        return new CustomerPage(List.copyOf(entries),
                more ? Optional.of(entries.get(entries.size() - 1).id()) : Optional.empty());
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public CustomerDetail detail(CustomerId id) {
        return customers.detail(id)
                .orElseThrow(() -> new CustomerNotFoundException(id.value()));
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public CustomerDetail replaceNotes(CustomerId id, Optional<String> notes) {
        if (!customers.replaceNotes(id, notes)) {
            throw new CustomerNotFoundException(id.value());
        }
        // Read back rather than reconstructed: the visit counts are not the
        // caller's to send, and returning what was written would state them
        // wrong the first time somebody books between the two statements.
        return detail(id);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public CustomerDetail setBlocked(CustomerId id, boolean blocked) {
        if (!customers.setBlocked(id, blocked)) {
            throw new CustomerNotFoundException(id.value());
        }
        return detail(id);
    }
}
