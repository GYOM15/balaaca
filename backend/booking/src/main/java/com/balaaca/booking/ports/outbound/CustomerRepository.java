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
}
