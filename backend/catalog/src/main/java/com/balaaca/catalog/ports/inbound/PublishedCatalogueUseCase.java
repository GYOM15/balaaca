package com.balaaca.catalog.ports.inbound;

import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Money;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

/**
 * The catalogue as a stranger sees it.
 *
 * <p>Separate from {@link ManageServiceOfferingsUseCase} rather than the same
 * list with fields dropped further out: the decision to withhold a price is
 * made by the module that owns the price, once, and what leaves here cannot
 * carry one it should not. A caller cannot forget a condition it was never
 * given.
 *
 * <p>The buffers padding each appointment do not appear at all. They are how
 * the provider organises a chair, and publishing them would tell a customer how
 * long the sweeping takes.
 */
public interface PublishedCatalogueUseCase {

    /** Active services only, in the provider's own order. Never the retired ones. */
    List<PublishedService> published();

    /**
     * @param price empty when the provider chose not to publish it - absent
     *              rather than zero, which a client would render as free
     */
    record PublishedService(ServiceOfferingId id,
                            String name,
                            Optional<String> description,
                            Duration duration,
                            /**
                             * Present when the customer hands the work over
                             * rather than waiting for it. "Ready in 48 h" is
                             * something they need BEFORE choosing, which is why
                             * it is published rather than kept for the ticket.
                             */
                            Optional<Duration> turnaround,
                            Optional<Money> price) {

        public boolean isDropOff() {
            return turnaround.isPresent();
        }
    }
}
