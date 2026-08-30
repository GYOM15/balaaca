package com.balaaca.platformkernel.audit;

/**
 * The record of what the platform did and what it refused.
 *
 * <p>Two methods because they belong in two different transactions, and getting
 * that wrong makes the trail lie in one of two ways.
 *
 * <p>A SUCCESS joins the caller's transaction: an audit row that committed while
 * the action it describes rolled back is a record of something that never
 * happened. A DENIED cannot join it - the refusal is what aborts that
 * transaction - so it opens its own and commits regardless, which is the only
 * way a refusal survives at all.
 */
public interface AuditTrail {

    /** Joins the caller's transaction. Commits with the action or not at all. */
    void record(AuditEvent event);

    /** Its own transaction. Survives the rollback the refusal causes. */
    void recordRefusal(AuditEvent event);
}
