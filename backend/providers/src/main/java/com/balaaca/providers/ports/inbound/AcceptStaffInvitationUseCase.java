package com.balaaca.providers.ports.inbound;

/**
 * Joining a team that invited you.
 *
 * <p>The second capability on this platform that runs with no tenant bound, and
 * for the same reason as signing up: the caller has no membership yet, and this
 * is what gives them one.
 */
public interface AcceptStaffInvitationUseCase {

    /**
     * @throws com.balaaca.providers.domain.InvitationNotFoundException unknown,
     *         expired, already redeemed, or at a business that is suspended -
     *         one answer, because telling them apart says whether a code ever
     *         existed
     * @throws com.balaaca.providers.domain.AlreadyRegisteredException the
     *         account already belongs somewhere
     */
    JoinedProvider accept(String code, Account account);

    /** Who the caller is, from the verified token and never from a request. */
    record Account(String subject, String displayName, java.util.Optional<String> email) {
    }

    /**
     * @param displayName the name the OWNER gave this chair, not one the caller
     *                    chose: they were invited to a seat that already existed
     */
    record JoinedProvider(String providerSlug, String businessName, String displayName) {
    }
}
