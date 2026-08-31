package com.balaaca.catalog.ports.inbound;

/**
 * Where the work happens.
 *
 * <p>The third shape of a transaction on this platform, beside sitting down and
 * handing something over. A plumber, a cleaner, a mover and a solar fitter do
 * not receive the customer - they travel to them, and an appointment for one of
 * them is worthless without an address.
 *
 * <p>In ports.inbound and not in the domain, because it is not catalog's own
 * business: {@code BookableOffering} carries it, {@code booking} freezes it onto
 * the appointment, and the edge renders it. A published vocabulary word belongs
 * where the rest of the published vocabulary lives.
 *
 * <p>Deliberately two values and not three. "Either" reads as generous and is
 * unanswerable at booking time: the diary would not know whether to ask for an
 * address, and the customer would not know whether to give one. A provider who
 * genuinely does both publishes two services, which is also what they charge
 * differently for.
 */
public enum ServiceLocation {

    /** The customer comes to the shop. Every service that existed before V031. */
    AT_PROVIDER,

    /** The provider travels. The appointment then carries where to. */
    AT_CUSTOMER
}
