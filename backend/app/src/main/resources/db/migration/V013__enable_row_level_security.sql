-- Tenant isolation, enforced by the database rather than trusted to the
-- application. The application role holds neither table ownership nor
-- BYPASSRLS, so these policies actually bind it.

-- ---------------------------------------------------------------------------
-- Tenant resolution: breaking the circularity
-- ---------------------------------------------------------------------------
-- provider_staff is tenant-scoped, but it is also what we must read to LEARN
-- the tenant. With FORCE RLS and no GUC bound, a plain read returns zero rows
-- and nobody can ever authenticate. A SECURITY DEFINER function owned by a role
-- with its own narrow policy is what breaks that, and it returns one uuid.

CREATE POLICY provider_staff_resolution ON provider_staff
    FOR SELECT TO balaaca_resolver USING (true);

-- Owning an object in a schema requires CREATE on it, so the grant is opened
-- for the ownership transfer below and closed again immediately. The resolver
-- keeps USAGE only: it must be able to read through its functions, never to
-- create anything.
GRANT CREATE ON SCHEMA public TO balaaca_resolver;

CREATE OR REPLACE FUNCTION app_resolve_provider(p_subject varchar) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT ps.provider_id
      FROM provider_staff ps
      JOIN users u ON u.id = ps.user_id
     WHERE u.keycloak_user_id = p_subject
       AND ps.status = 'ACTIVE'
$$;
ALTER FUNCTION app_resolve_provider(varchar) OWNER TO balaaca_resolver;
REVOKE ALL ON FUNCTION app_resolve_provider(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_provider(varchar) TO balaaca_app;

-- The public booking path. A customer is not staff, so membership resolution
-- yields nothing for them and a booking route with no tenant identifier would
-- answer 403 to everyone it exists for. The slug is the correct source: it is
-- already public, and it grants nothing the public page does not already show.
CREATE OR REPLACE FUNCTION app_resolve_published_provider(p_slug varchar) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM providers WHERE slug = p_slug AND published
$$;
ALTER FUNCTION app_resolve_published_provider(varchar) OWNER TO balaaca_resolver;
REVOKE ALL ON FUNCTION app_resolve_published_provider(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_published_provider(varchar) TO balaaca_app;

GRANT USAGE ON SCHEMA public TO balaaca_resolver;
GRANT SELECT ON provider_staff, users, providers TO balaaca_resolver;
REVOKE CREATE ON SCHEMA public FROM balaaca_resolver;

-- ---------------------------------------------------------------------------
-- The tenant root
-- ---------------------------------------------------------------------------
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers FORCE  ROW LEVEL SECURITY;

CREATE POLICY providers_tenant ON providers
    USING      (id = app_current_provider())
    WITH CHECK (id = app_current_provider());

-- Search and the hub homepage list many providers with no single tenant bound.
-- Policies are OR'd, so a published provider is readable without one; a
-- provider's own private columns are still only reachable under its tenant.
CREATE POLICY providers_public_read ON providers
    FOR SELECT USING (published);

-- ---------------------------------------------------------------------------
-- Tenant-scoped tables. The predicate form matters: current_setting without
-- missing_ok raises 42704 when unbound, and ''::uuid raises 22P02 - a 500 where
-- a clean 404 belongs. app_current_provider() returns NULL and filters instead.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'provider_staff', 'service_offerings', 'customers',
        'availability_rules', 'availability_overrides',
        'appointments', 'notifications', 'subscriptions'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I '
            'USING (provider_id = app_current_provider()) '
            'WITH CHECK (provider_id = app_current_provider())',
            t || '_tenant', t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
    providers, provider_staff, service_offerings, customers,
    availability_rules, availability_overrides, appointments,
    notifications, subscriptions, users
TO balaaca_app;
GRANT SELECT ON provider_categories TO balaaca_app;

-- Append-only: an audit trail the application can rewrite is not a trail.
GRANT SELECT, INSERT ON audit_logs TO balaaca_app;
REVOKE UPDATE, DELETE ON audit_logs FROM balaaca_app;
GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO balaaca_app;

-- The worker drains every tenant's notifications, so it does not bind a tenant
-- and never reads a tenant table: the notification row is self-contained.
CREATE POLICY notifications_worker ON notifications
    FOR ALL TO balaaca_notification_worker USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE ON notifications TO balaaca_notification_worker;

-- Without this, a data-fixing migration matches zero rows and reports success,
-- because FORCE binds the owner too.
CREATE POLICY notifications_maintenance ON notifications
    FOR ALL TO balaaca_migrator USING (true) WITH CHECK (true);
