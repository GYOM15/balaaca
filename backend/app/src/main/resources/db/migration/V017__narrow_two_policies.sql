-- Two policies that admitted more than their own comments claimed.
--
-- 1. providers_public_read had no TO clause, so it applied to balaaca_app and
--    was OR'd with providers_tenant. Row-level security is ROW-level: once a row
--    is admitted, every COLUMN of it is. V013's own comment - "a provider's own
--    private columns are still only reachable under its tenant" - stated a
--    guarantee PostgreSQL does not offer. Any authenticated `FROM providers`
--    that forgot `WHERE id = app_current_provider()` returned every published
--    business's whole row: public_email, the booking policy, the cancellation
--    deadline, whether it is featured. Every repository does name it today; the
--    boundary should not depend on all of them continuing to.
--
--    Public reading is what an UNBOUND connection does. The hub is the only
--    caller: the provider page binds its tenant from the slug first and reads
--    through providers_tenant, and the resolver reads through its own policy.
--    Narrowing this to "no tenant bound" costs nothing and closes it.
DROP POLICY providers_public_read ON providers;
CREATE POLICY providers_public_read ON providers
    FOR SELECT
    USING (published
           AND status IN ('PENDING', 'ACTIVE')
           AND app_current_provider() IS NULL);

-- 2. provider_staff_registration constrained the ROLE column and nothing else,
--    so it admitted an OWNER row pointing at ANY provider - including one that
--    already belongs to someone else. Verified against 18.6: inserted directly
--    as balaaca_registrar, such a row makes app_resolve_membership hand the
--    attacker the victim's tenant on the next request.
--
--    Nothing exploitable today, because the order of the two INSERTs in
--    app_register_provider stops it: a caller passing an existing provider's id
--    fails on providers_pkey before any staff row is written, which is also
--    verified. But that defence lives in a function body annotated by a comment,
--    and V014's own EXCEPTION handler already shows the body being edited. One
--    reordering, or an ON CONFLICT DO NOTHING added to the providers insert, and
--    takeover is open again with the policy still reporting green.
--
--    So the invariant is stated where it cannot be edited away: the registrar
--    may add an owner only to a provider that has NO staff at all - which is to
--    say, one created moments earlier in the same call.
CREATE POLICY provider_staff_registration_read ON provider_staff
    FOR SELECT TO balaaca_registrar USING (true);

DROP POLICY provider_staff_registration ON provider_staff;
CREATE POLICY provider_staff_registration ON provider_staff
    FOR INSERT TO balaaca_registrar
    WITH CHECK (role = 'OWNER'
                AND NOT EXISTS (SELECT 1 FROM provider_staff existing
                                 WHERE existing.provider_id = provider_staff.provider_id));

GRANT SELECT ON provider_staff TO balaaca_registrar;
