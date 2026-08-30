package com.balaaca.platformkernel.audit;

/** What happened, in the three words the table's CHECK constraint accepts. */
public enum AuditOutcome {

    SUCCESS,
    /** The platform refused. This is the one the trail exists for. */
    DENIED,
    FAILURE
}
