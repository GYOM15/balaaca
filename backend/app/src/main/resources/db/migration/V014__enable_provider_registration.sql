-- Signing up: creating a tenant before a tenant exists.
--
-- Every write path so far runs with app.provider_id bound, and providers_tenant
-- carries WITH CHECK (id = app_current_provider()). With nothing bound that
-- predicate is NULL, so a salon that registers in Keycloak can authenticate,
-- reach every route, and be refused by all of them forever: there is no INSERT
-- any role can perform that brings its rows into existence.
--
-- This is the same circularity V013 broke for reading, so it is broken the same
-- way - a SECURITY DEFINER function owned by a role with its own narrow policy.
-- It is a separate role from balaaca_resolver, which stays read-only: "what can
-- bring a provider into existence" then has exactly one answer.

-- Roles cannot be created by a migration: balaaca_migrator is NOCREATEROLE, on
-- purpose. So this fails early and legibly instead of at the first CREATE
-- POLICY, where the message names a policy and not the thing that is missing.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'balaaca_registrar') THEN
        RAISE EXCEPTION 'role balaaca_registrar does not exist'
            USING HINT = 'This migration adds a role the cluster predates. '
                         'Re-run infrastructure/postgres/bootstrap.sh as superuser '
                         '- it is idempotent - then start the application again. '
                         'See docs/DEPLOYMENT.md.';
    END IF;
END $$;

GRANT CREATE ON SCHEMA public TO balaaca_registrar;

-- The registrar may only ever create a DORMANT provider. published and status
-- are left to their defaults by the function below, and this policy is what
-- makes that a rule rather than a habit: no rewrite of the function can produce
-- a provider that is already live on the public booking path.
CREATE POLICY providers_registration ON providers
    FOR INSERT TO balaaca_registrar
    WITH CHECK (NOT published AND status = 'PENDING');

-- And only ever an OWNER row. A STAFF row is an ordinary tenant-scoped write
-- that belongs to an authenticated provider, not to registration.
CREATE POLICY provider_staff_registration ON provider_staff
    FOR INSERT TO balaaca_registrar
    WITH CHECK (role = 'OWNER');

GRANT SELECT, INSERT ON users TO balaaca_registrar;
GRANT INSERT ON providers, provider_staff TO balaaca_registrar;

-- The account, the business, and the owner's membership, in one statement.
--
-- p_subject is the verified JWT subject; the application passes what the OIDC
-- extension validated, exactly as it does for app_resolve_provider.
--
-- The ORDER of the two inserts is load-bearing, not stylistic. The provider row
-- goes in first, so a caller who passes an EXISTING provider's id fails on
-- providers_pkey before any staff row is written. Reverse them and this
-- function becomes a salon takeover: insert an OWNER row into someone else's
-- provider and the resolver hands you their tenant on the next request.
--
-- Uniqueness is left to the database - a check-then-insert only narrows the
-- window it pretends to close - and the constraint that fired is translated
-- HERE rather than in Java. Every unique violation arrives as one SQLSTATE, so
-- telling them apart means reading a constraint name, and that is a driver type
-- the providers module has no other reason to depend on. The translation is
-- done where the constraint names already are:
--
--   providers_slug_key                       -> Z0001  the handle is taken
--   uq_provider_staff_one_active_membership  -> Z0002  this account has a salon
--   users_keycloak_user_id_key               -> Z0002  raced with itself
--
-- Anything else is re-raised untouched. providers_pkey in particular means the
-- application generated a uuid that already exists, which is a fault and must
-- surface as one rather than as a friendly message about handles.
CREATE OR REPLACE FUNCTION app_register_provider(
        p_subject       varchar,
        p_user_id       uuid,
        p_display_name  varchar,
        p_email         varchar,
        p_provider_id   uuid,
        p_slug          varchar,
        p_business_name varchar,
        p_category_id   uuid,
        p_city          varchar,
        p_timezone      varchar,
        p_staff_id      uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user_id    uuid;
    v_constraint text;
BEGIN
    SELECT id INTO v_user_id FROM users WHERE keycloak_user_id = p_subject;
    IF v_user_id IS NULL THEN
        INSERT INTO users (id, keycloak_user_id, display_name, email)
             VALUES (p_user_id, p_subject, p_display_name, p_email);
        v_user_id := p_user_id;
    END IF;

    INSERT INTO providers (id, slug, business_name, category_id, city, timezone)
         VALUES (p_provider_id, p_slug, p_business_name, p_category_id,
                 p_city, p_timezone);

    INSERT INTO provider_staff (id, provider_id, user_id, display_name, role)
         VALUES (p_staff_id, p_provider_id, v_user_id, p_display_name, 'OWNER');

EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'providers_slug_key' THEN
        RAISE EXCEPTION 'handle already taken' USING ERRCODE = 'Z0001';
    ELSIF v_constraint IN ('uq_provider_staff_one_active_membership',
                           'users_keycloak_user_id_key') THEN
        RAISE EXCEPTION 'account already has a business' USING ERRCODE = 'Z0002';
    END IF;
    RAISE;
END $$;

ALTER FUNCTION app_register_provider(varchar, uuid, varchar, varchar, uuid,
                                     varchar, varchar, uuid, varchar, varchar,
                                     uuid) OWNER TO balaaca_registrar;
REVOKE ALL ON FUNCTION app_register_provider(varchar, uuid, varchar, varchar,
                                             uuid, varchar, varchar, uuid,
                                             varchar, varchar, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_register_provider(varchar, uuid, varchar, varchar,
                                                uuid, varchar, varchar, uuid,
                                                varchar, varchar, uuid) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_registrar;
