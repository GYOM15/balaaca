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
#
# The role NAMES are fixed, not configurable. They used to come from
# BALAACA_DB_*_USER, which application.properties and .env.example both echoed -
# so all three looked like settings. They were not: V013 and V014 grant to the
# literal identifiers, so an operator who renamed the application role got a
# cluster where bootstrap succeeded and Flyway aborted with 'role balaaca_app
# does not exist'. The variables were a lie; they are gone.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
         -v app_password="${BALAACA_DB_APP_PASSWORD}" \
         -v migrator_password="${BALAACA_DB_MIGRATOR_PASSWORD}" \
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
SELECT 'CREATE ROLE ' || 'balaaca_migrator'
    || ' LOGIN PASSWORD ' || quote_literal(:'migrator_password')
    || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'balaaca_migrator')
\gexec

-- The application connection. It must NOT own tables and must NOT hold
-- BYPASSRLS, or Row-Level Security is silently inert for it.
SELECT 'CREATE ROLE ' || 'balaaca_app'
    || ' LOGIN PASSWORD ' || quote_literal(:'app_password')
    || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'balaaca_app')
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

-- Owns the two SECURITY DEFINER functions that suspend and reinstate a
-- business. Its own role, not the registrar's, because "who can take a salon
-- off the hub" must have exactly one answer and it must not be the same answer
-- as "who can put one on it". NOLOGIN: its UPDATE grant is reachable through
-- those two functions and nowhere else, so there is no session anywhere that
-- can quietly change a provider's standing.
SELECT 'CREATE ROLE balaaca_moderator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'balaaca_moderator')
\gexec

-- The notification worker, restricted to the notifications table by its
-- policies and grants.
SELECT 'CREATE ROLE ' || 'balaaca_notification_worker'
    || ' LOGIN PASSWORD ' || quote_literal(:'worker_password')
    || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'balaaca_notification_worker')
\gexec

-- The schema belongs to the migrator; the application only uses it.
ALTER SCHEMA public OWNER TO balaaca_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT  USAGE  ON SCHEMA public TO balaaca_app, balaaca_notification_worker,
                                  balaaca_resolver, balaaca_registrar,
                                  balaaca_moderator;

-- The migrations transfer ownership of the SECURITY DEFINER resolution
-- functions to balaaca_resolver, and ALTER FUNCTION ... OWNER TO requires
-- membership of the target role. The migrator is the schema owner already and
-- is never used at runtime, so this grants it nothing it did not have.
GRANT balaaca_resolver, balaaca_registrar, balaaca_moderator TO balaaca_migrator;

-- CREATE on the database so the migrations can install their own extensions.
-- btree_gist, citext and pg_trgm are trusted extensions since PostgreSQL 13, so
-- this needs no superuser. Keeping extensions in a versioned migration rather
-- than here means a fresh VPS gets the same schema from Flyway alone.
GRANT CREATE ON DATABASE :"db_name" TO balaaca_migrator;

-- Anything Flyway creates later is usable by the application without a further
-- GRANT pass. Table-level grants stay explicit in the migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE balaaca_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO balaaca_app;
SQL

# Keycloak keeps its own database in the same instance: one less container to
# run, and its schema never mixes with the application's.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
         -v kc_user_name="${KEYCLOAK_DB_USER}" \
     -v kc_password="${KEYCLOAK_DB_PASSWORD}" <<'SQL'
SELECT 'CREATE ROLE ' || quote_ident(:'kc_user_name')
    || ' LOGIN PASSWORD ' || quote_literal(:'kc_password')
    || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'kc_user_name')
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
