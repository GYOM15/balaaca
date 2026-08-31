-- The one lever the platform has, and the trace it leaves.
--
-- V035 left `status` with two values, both meaningful and neither reachable.
-- This is the path that reaches them: a business that defrauds customers, that
-- is a fake listing, or that is using the hub for something it should not, is
-- taken off it - and put back, because the first suspension made in a hurry
-- will sometimes be wrong.
--
-- Deliberately NOT a back-office. There is no screen and no queue, because a
-- console is only worth building once a customer can report a provider - and
-- until then it is a page the founder looks at instead of an inbox that tells
-- him something is wrong. V037 builds the inbox. This builds the lever.
--
--
-- Why the reason lives on the row AND in the audit trail
--
-- They answer different questions and neither answers the other's.
--
-- audit_logs answers "what happened, who did it, when" - it is append-only, it
-- survives a reinstatement, and it is what a founder reads back months later
-- when a provider contests the decision. It is the record.
--
-- The columns here answer "what is true right now", and they exist for the
-- SALON, not for the platform: a business whose page has vanished must be able
-- to open its own dashboard and read why. Without them the provider's only
-- signal is that customers stopped arriving, which is how a support burden and
-- a reputation are made at the same time.

ALTER TABLE providers ADD COLUMN suspended_at timestamptz;
ALTER TABLE providers ADD COLUMN suspension_reason varchar(500);

-- The three facts move together or the row is lying. A status of SUSPENDED with
-- no reason is a page that vanished with no explanation to give its owner; a
-- reason left behind after a reinstatement is a business carrying an accusation
-- that no longer applies.
ALTER TABLE providers
    ADD CONSTRAINT ck_providers_suspension_coherent
    CHECK ((status = 'SUSPENDED') = (suspended_at IS NOT NULL)
           AND (suspended_at IS NULL) = (suspension_reason IS NULL));

-- A reason of three spaces would satisfy NOT NULL and tell nobody anything -
-- the same rule V034 applied to a quartier and to a set of directions.
ALTER TABLE providers
    ADD CONSTRAINT ck_providers_suspension_reason_meaningful
    CHECK (suspension_reason IS NULL OR btrim(suspension_reason) <> '');

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'balaaca_moderator') THEN
        RAISE EXCEPTION 'role balaaca_moderator does not exist'
            USING HINT = 'This migration adds a role the cluster predates. '
                         'Re-run infrastructure/postgres/bootstrap.sh as superuser '
                         '- it is idempotent - then start the application again. '
                         'See docs/DEPLOYMENT.md.';
    END IF;
END $$;

-- Ownership of a function can only be handed to a role that may create in the
-- schema, so the grant is opened for the length of this migration and closed
-- again at the bottom. Exactly what V014 does for the registrar, and for the
-- same reason: the role must own the function, and must not be able to add
-- anything else to the schema afterwards.
GRANT CREATE ON SCHEMA public TO balaaca_moderator;

-- ---------------------------------------------------------------------------
-- A suspended salon still reaches its own dashboard.
-- ---------------------------------------------------------------------------
--
-- The membership resolver admitted PENDING and ACTIVE, which after V035 means
-- ACTIVE alone - so suspending a business locked its owner out of the
-- application entirely. That is wrong in two ways, and the second is the one
-- that matters.
--
-- The first: the suspension reason is written onto the provider's row so the
-- salon can read WHY its page vanished. Locked out, they read nothing, and the
-- column is decoration.
--
-- The second: suspension deliberately does not cancel appointments already
-- booked. Those customers are still coming on Thursday. A provider who cannot
-- open their diary cannot see who - so a lockout would convert a suspension
-- into a guaranteed set of missed appointments, harming exactly the customers
-- the suspension was meant to protect.
--
-- So the standing gates the PUBLIC surface and nothing else. Everything a
-- suspended provider can still reach is their own: their diary, their profile,
-- their team. What they cannot do is be found, be booked, or be visited by
-- anybody who did not already hold an appointment.
-- The shape is V018's, which added user_id. Repeated in full rather than
-- patched, because CREATE OR REPLACE cannot change a return type and a
-- mismatched column list fails with 42P13 at migration time.
CREATE OR REPLACE FUNCTION app_resolve_membership(p_subject varchar)
RETURNS TABLE (provider_id uuid, staff_id uuid, user_id uuid, staff_role varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT ps.provider_id, ps.id, u.id, ps.role
      FROM provider_staff ps
      JOIN users u     ON u.id = ps.user_id
      JOIN providers p ON p.id = ps.provider_id
     WHERE u.keycloak_user_id = p_subject
       AND ps.status = 'ACTIVE'
       AND u.status  = 'ACTIVE'
       -- Every standing a provider can hold. The predicate is kept rather than
       -- dropped so the next person to add a value to ck_providers_status has
       -- to decide, here, whether it may sign in.
       AND p.status IN ('ACTIVE', 'SUSPENDED')
$$;

-- Two policies, not one, and the pair is the same shape the registrar has.
--
-- An UPDATE reads the rows its WHERE clause names, so it is subject to the
-- SELECT policies as well as its own. Without the read policy this role sees
-- only what an anonymous visitor sees - published and ACTIVE - which fails in
-- both directions at once: it cannot reach an already-suspended business to
-- reinstate it, and suspending one makes the new row invisible to the very
-- policy that admitted it, which PostgreSQL reports as a WITH CHECK violation.
-- Verified on 18.6, and it cost an hour to find, so it is written down.
CREATE POLICY providers_moderation_read ON providers
    FOR SELECT TO balaaca_moderator
    USING (true);

-- The write half. UPDATE only: this role cannot insert a provider or delete
-- one, and the two functions below are the only statements that ever run as it.
CREATE POLICY providers_moderation ON providers
    FOR UPDATE TO balaaca_moderator
    USING (true)
    WITH CHECK (true);

GRANT SELECT, UPDATE ON providers TO balaaca_moderator;

-- ---------------------------------------------------------------------------
-- The two transitions, as functions, because balaaca_app has no way in.
-- ---------------------------------------------------------------------------
--
-- Every other write in this codebase is confined by RLS to the tenant bound on
-- the connection. Moderation cannot be: it acts on somebody ELSE's provider by
-- definition, and providers_tenant admits nothing with no tenant bound. So it
-- goes through SECURITY DEFINER functions owned by a role that has exactly this
-- one power - the same shape V014 used to break the same circularity for
-- registration.
--
-- They return the provider id so the caller can write the audit row against it
-- without a second lookup, and they raise rather than returning NULL for an
-- unknown slug, so a typo cannot read as a silent success.

-- They RETURN THE ROW, not an id, and that is not a convenience.
--
-- The first shape returned an id and let the caller read the provider back. It
-- worked for a suspension and then reported 404: the read-back runs as
-- balaaca_app with no tenant bound, whose only SELECT policy on providers is
-- the public one - published AND status = 'ACTIVE'. Suspending a business makes
-- it invisible to the very connection that just suspended it, so the operator
-- was told the salon did not exist while the salon was, in fact, suspended.
--
-- Every moderation read has that shape, which is why all four of them are
-- functions. balaaca_app cannot see a suspended provider and cannot see
-- provider_reports at all; the moderator can see everything and can do nothing
-- else. Handing the answer back from inside is what keeps both true.

CREATE FUNCTION app_suspend_provider(p_slug varchar, p_reason varchar)
RETURNS TABLE (o_slug varchar, o_status varchar,
               o_suspended_at timestamptz, o_reason varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    UPDATE providers
       SET status            = 'SUSPENDED',
           suspended_at      = now(),
           suspension_reason = btrim(p_reason),
           updated_at        = now()
     WHERE slug = p_slug
       AND status <> 'SUSPENDED'
    RETURNING slug, status, suspended_at, suspension_reason;

    IF NOT FOUND THEN
        -- One SQLSTATE for "no such slug" and "already suspended", because the
        -- caller does the same thing with both: nothing changed.
        RAISE EXCEPTION 'nothing to suspend' USING ERRCODE = 'Z0003';
    END IF;
END $$;

CREATE FUNCTION app_reinstate_provider(p_slug varchar)
RETURNS TABLE (o_slug varchar, o_status varchar,
               o_suspended_at timestamptz, o_reason varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- The reason is cleared, not archived here. audit_logs already holds it
    -- with its date and its author, and a business that has been reinstated
    -- must not keep carrying the accusation on its own row.
    RETURN QUERY
    UPDATE providers
       SET status            = 'ACTIVE',
           suspended_at      = NULL,
           suspension_reason = NULL,
           updated_at        = now()
     WHERE slug = p_slug
       AND status = 'SUSPENDED'
    RETURNING slug, status, suspended_at, suspension_reason;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'nothing to reinstate' USING ERRCODE = 'Z0004';
    END IF;
END $$;

ALTER FUNCTION app_suspend_provider(varchar, varchar) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_suspend_provider(varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_suspend_provider(varchar, varchar) TO balaaca_app;

ALTER FUNCTION app_reinstate_provider(varchar) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_reinstate_provider(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reinstate_provider(varchar) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_moderator;
