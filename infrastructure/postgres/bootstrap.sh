#!/bin/bash
# Creates the least-privilege roles the application needs, and Keycloak's own
# database. Runs once, as superuser, when the data directory is initialised.
#
# On a VPS the container init does not run against an existing cluster: execute
# the equivalent by hand once. See docs/DEPLOYMENT.md.
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
     -v worker_password="${BALAACA_DB_WORKER_PASSWORD}" <<'SQL'

-- Owns the schema and runs Flyway. Never used at runtime.
CREATE ROLE :"migrator_user" LOGIN PASSWORD :'migrator_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- The application connection. It must NOT own tables and must NOT hold
-- BYPASSRLS, or Row-Level Security is silently inert for it.
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Owns the SECURITY DEFINER resolution functions. It is the only role that may
-- read provider_staff before a tenant is bound, which is what breaks the
-- circularity of resolving a tenant from a tenant-scoped table. NOLOGIN: it is
-- never connected as, only impersonated by its own functions.
CREATE ROLE balaaca_resolver NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- The notification worker, restricted to the notifications table by its
-- policies and grants.
CREATE ROLE :"worker_user" LOGIN PASSWORD :'worker_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- The schema belongs to the migrator; the application only uses it.
ALTER SCHEMA public OWNER TO :"migrator_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT  USAGE  ON SCHEMA public TO :"app_user", :"worker_user", balaaca_resolver;

-- Anything Flyway creates later is usable by the application without a further
-- GRANT pass. Table-level grants stay explicit in the migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_user" IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v kc_user="${KEYCLOAK_DB_USER}" \
     -v kc_password="${KEYCLOAK_DB_PASSWORD}" \
     -v kc_db="${KEYCLOAK_DB}" <<'SQL'
-- Keycloak keeps its own database in the same instance: one less container to
-- run, and its schema never mixes with the application's.
CREATE ROLE :"kc_user" LOGIN PASSWORD :'kc_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -c "CREATE DATABASE \"${KEYCLOAK_DB}\" OWNER \"${KEYCLOAK_DB_USER}\""

echo "bootstrap: roles and keycloak database created"
