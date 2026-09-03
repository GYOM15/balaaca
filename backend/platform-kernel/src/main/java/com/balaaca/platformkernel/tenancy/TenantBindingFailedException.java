package com.balaaca.platformkernel.tenancy;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The database session variable could not be set. Every RLS policy would then
 * filter every row, so this is reported rather than allowed to look like an
 * empty tenant.
 */
public final class TenantBindingFailedException extends DomainException {

    public TenantBindingFailedException(Throwable cause) {
        super("INTERNAL_ERROR", 500, "Could not bind the tenant session", Map.of(), cause);
    }
}
