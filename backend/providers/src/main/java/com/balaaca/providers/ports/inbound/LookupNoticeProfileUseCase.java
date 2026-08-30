package com.balaaca.providers.ports.inbound;

/**
 * Reads what a notification needs to know about the tenant already bound on
 * this request.
 *
 * <p>It takes no provider identifier, and that is the point: the tenant is
 * ambient, resolved server-side, and a parameter here would be an identifier a
 * caller could get wrong (see {@code multi-tenant-rls}).
 */
public interface LookupNoticeProfileUseCase {

    NoticeProfile currentNoticeProfile();
}
