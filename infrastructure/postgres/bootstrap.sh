#!/bin/bash
# Creates the least-privilege roles the application needs, and Keycloak's own
# database. Runs as superuser when the data directory is initialised - and
# again, by hand, whenever a migration needs a role this file has learned about
# since. That second case is why every statement below is IDEMPOTENT.
#
# It was not, and that was a live outage waiting: balaaca_registrar arrived with
# V014, this script only runs on an EMPTY data directory, and no migration can
# create a role because balaaca_migrator is NOCREATEROLE. On any cluster that
# already held data, Flyway reached V014, PostgreSQL answered 'role
# balaaca_registrar does not exist', and with migrate-at-start the API never
# came up. Re-running this file is now the documented remedy, and V014 says so
# in the error it raises.
#
# See docs/DEPLOYMENT.md.
#
# Passwords arrive as psql variables and are interpolated with :'name', which
# quotes them as literals. Never build this SQL by string concatenation.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_user="${BALAACA_DB_APP_USER}" \
     -v app_password="${BALAACA_DB_APP_PASSWORD}" \
     -v migrator_user="${BALAACA_DB_MIGRATOR_USER}" \
     -v migrator_password="${BALAACA_DB_MIGRATOR_PASSWORD}" \
     -v worker_user="${BALAACA_DB_WORKER_USER}" \
     -v worker_password="${BALAACA_DB_WORKER_PASSWORD}" \
     -v db_name="${POSTGRES_DB}" <<'SQL'

-- Every role is created only if absent, so this file is safe to re-run against
-- a cluster that already holds data. An existing role's password is NOT
-- re-applied: rotating a credential out from under a running application is a
-- separate, deliberate act, not a side effect of adding a role.
--
-- \gexec runs each row the query returns as its own statement. quote_ident and
-- quote_literal do the escaping, so nothing here is string concatenation of
-- untrusted text.

-- Owns the schema and runs Flyway. Never used at runtime.
SELECT 'CREATE ROLE ' || quote_ident(:'migrator_user')
    || ' LOGIN PASSWORD ' || quote_literal(:'migrator_password')
    || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'migrator_user')
\gexec

-- The application connection. It must NOT own tables and must NOT hold
-- BYPASSRLS, or Row-Level Security is silently inert for it.
SELECT 'CREATE ROLE ' || quote_ident(:'app_user')
    || ' LOGIN PASSWORD ' || quote_literal(:'app_password')
    || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user')
\gexec

-- Owns the SECURITY DEFINER resolution functions. It is the only role that may
-- read provider_staff before a tenant is bound, which is what breaks the
-- circularity of resolving a tenant from a tenant-scoped table. NOLOGIN: it is
-- never connected as, only impersonated by its own functions.
SELECT 'CREATE ROLE balaaca_resolver NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'balaaca_resolver')
\gexec

-- Owns the one SECURITY DEFINER function that creates a tenant. Separate from
-- balaaca_resolver, which stays read-only: "who can bring a provider into
-- existence" then has exactly one answer, and it is this role. NOLOGIN, so its
-- INSERT grants are reachable through that function and nowhere else.
SELECT 'CREATE ROLE balaaca_registrar NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'balaaca_registrar')
\gexec

-- The notification worker, restricted to the notifications table by its
-- policies and grants.
SELECT 'CREATE ROLE ' || quote_ident(:'worker_user')
    || ' LOGIN PASSWORD ' || quote_literal(:'worker_password')
    || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'worker_user')
\gexec

-- The schema belongs to the migrator; the application only uses it.
ALTER SCHEMA public OWNER TO :"migrator_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT  USAGE  ON SCHEMA public TO :"app_user", :"worker_user",
                                  balaaca_resolver, balaaca_registrar;

-- The migrations transfer ownership of the SECURITY DEFINER resolution
-- functions to balaaca_resolver, and ALTER FUNCTION ... OWNER TO requires
-- membership of the target role. The migrator is the schema owner already and
-- is never used at runtime, so this grants it nothing it did not have.
GRANT balaaca_resolver, balaaca_registrar TO :"migrator_user";

-- CREATE on the database so the migrations can install their own extensions.
-- btree_gist, citext and pg_trgm are trusted extensions since PostgreSQL 13, so
-- this needs no superuser. Keeping extensions in a versioned migration rather
-- than here means a fresh VPS gets the same schema from Flyway alone.
GRANT CREATE ON DATABASE :"db_name" TO :"migrator_user";

-- Anything Flyway creates later is usable by the application without a further
-- GRANT pass. Table-level grants stay explicit in the migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_user" IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL

# Keycloak keeps its own database in the same instance: one less container to
# run, and its schema never mixes with the application's.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v kc_user="${KEYCLOAK_DB_USER}" \
     -v kc_password="${KEYCLOAK_DB_PASSWORD}" <<'SQL'
SELECT 'CREATE ROLE ' || quote_ident(:'kc_user')
    || ' LOGIN PASSWORD ' || quote_literal(:'kc_password')
    || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'kc_user')
\gexec
SQL

# CREATE DATABASE cannot run inside a transaction or a DO block, so the
# existence test is a separate query and the creation is conditional on it.
if [ "$(psql -tAX --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
          -c "SELECT 1 FROM pg_database WHERE datname = '${KEYCLOAK_DB}'")" != "1" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
         -c "CREATE DATABASE \"${KEYCLOAK_DB}\" OWNER \"${KEYCLOAK_DB_USER}\""
fi

echo "bootstrap: roles and keycloak database present"
