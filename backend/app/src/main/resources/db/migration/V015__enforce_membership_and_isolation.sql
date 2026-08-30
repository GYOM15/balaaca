-- Three things the schema described and nothing enforced.
--
-- 1. Suspension suspended nothing. app_resolve_provider filtered on the STAFF
--    row's status alone, ignoring users.status and providers.status, and the
--    public path keyed on `published` alone. So an account marked DELETED
--    resolved to its provider on the very next request - defeating the one
--    design premise of the tenant interceptor, which re-reads membership
--    uncached precisely so revocation is immediate - and a provider the
--    platform had SUSPENDED kept its dashboard AND stayed publicly bookable,
--    still taking customers' money and phone numbers through a page the
--    platform believed it had pulled.
--
-- 2. There was no OWNER/STAFF distinction anywhere. provider_staff.role was
--    written at registration and read by nothing, so every member with an
--    account had full control of the tenant. Resolution now returns the role,
--    which is what lets the service layer act on it.
--
-- 3. users and audit_logs carried tenant meaning with no row-level security at
--    all, while balaaca_app held full DML on both. No code names either table
--    today, so this is a grant waiting for its first caller rather than a live
--    breach - but users is the table that turns a Keycloak subject into a
--    tenant, and audit_logs is the record of tenant crossings. Leaving the
--    boundary to "no query happens to name it" is the application-filter
--    defence this project exists to avoid.

-- ---------------------------------------------------------------------------
-- 1 + 2. Resolution: status-aware, and it returns the role
-- ---------------------------------------------------------------------------
-- Replaced rather than amended: the return type changes, and two functions
-- answering almost the same question is how the answers drift apart.
DROP FUNCTION IF EXISTS app_resolve_provider(varchar);

-- Owning an object in a schema requires CREATE on it, so the grant is opened
-- for the ownership transfer below and closed again immediately - the same
-- dance V013 does, and for the same reason: the resolver must be able to read
-- through its functions, never to create anything.
GRANT CREATE ON SCHEMA public TO balaaca_resolver;

CREATE OR REPLACE FUNCTION app_resolve_membership(p_subject varchar)
RETURNS TABLE (provider_id uuid, staff_id uuid, staff_role varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT ps.provider_id, ps.id, ps.role
      FROM provider_staff ps
      JOIN users u     ON u.id = ps.user_id
      JOIN providers p ON p.id = ps.provider_id
     WHERE u.keycloak_user_id = p_subject
       AND ps.status = 'ACTIVE'
       AND u.status  = 'ACTIVE'
       -- PENDING is a provider that has registered and not yet published. It
       -- must reach its own dashboard; that is where it fills the page in.
       AND p.status IN ('PENDING', 'ACTIVE')
$$;
ALTER FUNCTION app_resolve_membership(varchar) OWNER TO balaaca_resolver;
REVOKE ALL ON FUNCTION app_resolve_membership(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_membership(varchar) TO balaaca_app;
REVOKE CREATE ON SCHEMA public FROM balaaca_resolver;

CREATE OR REPLACE FUNCTION app_resolve_published_provider(p_slug varchar) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM providers
     WHERE slug = p_slug AND published AND status IN ('PENDING', 'ACTIVE')
$$;

-- Resolution now JOINS providers, and providers is FORCE RLS with no policy
-- naming the resolver - so the join returned nothing and every caller was
-- refused. Verified: without this, app_resolve_membership answers zero rows for
-- a perfectly valid subject.
CREATE POLICY providers_resolution ON providers
    FOR SELECT TO balaaca_resolver USING (true);

-- The directory reads through this policy, not through the function, so the
-- same rule has to be stated here or a suspended salon stays in the hub.
DROP POLICY providers_public_read ON providers;
CREATE POLICY providers_public_read ON providers
    FOR SELECT USING (published AND status IN ('PENDING', 'ACTIVE'));

-- ---------------------------------------------------------------------------
-- 3. users
-- ---------------------------------------------------------------------------
-- No provider_id column: an account is not owned by a tenant, it is reachable
-- from one. The predicate goes through provider_staff, which is itself scoped,
-- so with nothing bound app_current_provider() is NULL and no row is visible.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE  ROW LEVEL SECURITY;

CREATE POLICY users_tenant ON users
    FOR ALL TO balaaca_app
    USING      (id IN (SELECT user_id FROM provider_staff
                        WHERE provider_id = app_current_provider()))
    WITH CHECK (id IN (SELECT user_id FROM provider_staff
                        WHERE provider_id = app_current_provider()));

-- Resolution reads users before any tenant exists; that is the circularity
-- V013 broke, and the same escape hatch has to cover this table.
CREATE POLICY users_resolution ON users
    FOR SELECT TO balaaca_resolver USING (true);

-- Registration creates the account in the same statement as the business, so
-- it necessarily writes a row no tenant can yet see.
CREATE POLICY users_registration ON users
    FOR ALL TO balaaca_registrar USING (true) WITH CHECK (true);

-- FORCE binds the owner too: without this a later backfill matches zero rows
-- and reports success.
CREATE POLICY users_maintenance ON users
    FOR ALL TO balaaca_migrator USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. audit_logs
-- ---------------------------------------------------------------------------
-- provider_id is nullable here, for a platform-wide action that belongs to no
-- tenant. Those rows are deliberately invisible to the application role: it may
-- read its own provider's trail and write its own provider's trail, and neither
-- across nor above. UPDATE and DELETE stay revoked, so the trail is still
-- append-only; what changes is that a provider can no longer read a
-- competitor's actions, nor forge a DENIED entry against one.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE  ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant ON audit_logs
    FOR ALL TO balaaca_app
    USING      (provider_id = app_current_provider())
    WITH CHECK (provider_id = app_current_provider());

CREATE POLICY audit_logs_maintenance ON audit_logs
    FOR ALL TO balaaca_migrator USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. The owner is bound by FORCE too, and nothing said so
-- ---------------------------------------------------------------------------
-- Only `notifications` had a maintenance policy. Every other tenant table was
-- FORCE ROW LEVEL SECURITY with no policy naming balaaca_migrator, which means
-- a data-fixing migration run as the schema owner matches ZERO rows and reports
-- success. Verified while writing this file: an UPDATE of providers by the
-- migrator silently touched nothing, and the only reason it was noticed is that
-- a test downstream expected the new value.
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'providers', 'provider_staff', 'service_offerings', 'customers',
        'availability_rules', 'availability_overrides', 'appointments',
        'subscriptions', 'users', 'audit_logs'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_policies
                        WHERE tablename = t AND policyname = t || '_maintenance') THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR ALL TO balaaca_migrator '
                'USING (true) WITH CHECK (true)', t || '_maintenance', t);
        END IF;
    END LOOP;
END $$;
