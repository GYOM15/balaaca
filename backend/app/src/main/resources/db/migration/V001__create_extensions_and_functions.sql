-- Roles are NOT created here: Flyway connects as balaaca_migrator, which must
-- already exist. They come from infrastructure/postgres/bootstrap.sh, run once
-- when the cluster is initialised (and by hand on a VPS).

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- "uuid =" needs a GiST opclass
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The tenant currently bound to this transaction, or NULL.
-- missing_ok = true is not optional: current_setting('x') raises 42704 when the
-- GUC was never set, and ''::uuid raises 22P02 - both a 500 where a 404 belongs.
CREATE OR REPLACE FUNCTION app_current_provider() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.provider_id', true), '')::uuid
$$;
