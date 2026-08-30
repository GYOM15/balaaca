package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.AcceptStaffInvitationUseCase.JoinedProvider;

/**
 * What to tell someone who has just joined.
 *
 * <p>Read with no tenant bound, through the same read-only resolver that turns a
 * subject into a membership - because at this instant the caller HAS a
 * membership and no request has yet bound it.
 */
public interface StaffJoinedRepository {

    JoinedProvider describe(String subject);
}
