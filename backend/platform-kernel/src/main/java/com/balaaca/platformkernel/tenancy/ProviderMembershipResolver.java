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
}
