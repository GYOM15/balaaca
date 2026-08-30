package com.balaaca.platformkernel.tenancy;

/**
 * Resolves a tenant from a server-verified source. Declared here because the
 * tenant interceptor needs it; implemented in the providers context, which owns
 * the tables it reads.
 *
 * <p>Neither method takes anything a client can choose freely: a Keycloak
 * subject comes from a verified token, and a slug only resolves when the
 * provider is published.
 */
public interface ProviderMembershipResolver {

    /**
     * @throws NoProviderMembershipException when the subject is not active staff
     *         of an active provider - which now covers a suspended account and a
     *         suspended or closed business, neither of which revoked anything
     *         before
     */
    Membership requireFor(String keycloakSubject);

    /** @throws ProviderNotPublishedException when the slug is unknown or unpublished */
    ProviderId requirePublished(String slug);

    /**
     * The tenant one booking belongs to, from the reference minted for its
     * customer.
     *
     * <p>Unlike a slug this does not require the provider to be published - a
     * salon that took a booking and then unpublished still owes that customer a
     * way to see and cancel it. A suspended or closed business is another
     * matter, and resolves to nothing.
     *
     * @throws com.balaaca.booking.domain.BookingExceptions.AppointmentNotFoundException
     *         is NOT thrown here; an unknown reference returns empty and the
     *         caller decides, because this module knows nothing about bookings
     */
    java.util.Optional<ProviderId> resolveBooking(String reference);
}
