package com.balaaca.booking.ports.outbound;

import com.balaaca.booking.ports.inbound.ListCustomersUseCase.CustomerDetail;
import com.balaaca.booking.ports.inbound.ListCustomersUseCase.CustomerSummary;
import com.balaaca.sharedkernel.ids.CustomerId;
import java.util.List;
import java.util.Optional;

/** The provider's own address book, read and annotated. */
public interface CustomerRepository {

    List<CustomerSummary> page(Optional<String> contains, Optional<CustomerId> after, int limit);

    Optional<CustomerDetail> detail(CustomerId id);

    /** @return false when the customer is not this provider's, or does not exist */
    boolean replaceNotes(CustomerId id, Optional<String> notes);

    /**
     * Refuses this person a booking on the public page, or lets them back.
     *
     * <p>An unconditional write rather than a read-modify-write: blocking
     * somebody already blocked is the switch staying where the provider put it,
     * and a guard that made that a failure would answer an error to a provider
     * who pressed the button twice.
     *
     * @return false when the customer is not this provider's, or does not exist
     */
    boolean setBlocked(CustomerId id, boolean blocked);
}
