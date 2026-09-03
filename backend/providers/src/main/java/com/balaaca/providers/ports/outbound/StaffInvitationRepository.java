package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.AcceptStaffInvitationUseCase.Account;
import com.balaaca.platformkernel.tenancy.ProviderId;

/**
 * Redeeming a code, before the caller has a tenant.
 *
 * <p>Separate from {@link StaffRepository} because it is a different privilege:
 * that one writes inside a bound tenant, this one writes a membership where none
 * exists yet, and so goes through the same SECURITY DEFINER seam as signing up.
 */
public interface StaffInvitationRepository {

    /**
     * @return the provider the caller has joined
     * @throws com.balaaca.providers.domain.InvitationNotFoundException unknown,
     *         expired, spent, or at a suspended business
     * @throws com.balaaca.providers.domain.AlreadyRegisteredException the
     *         account already belongs somewhere
     */
    ProviderId accept(String code, Account account);
}
