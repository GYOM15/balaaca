-- Roles the application needs, created before Flyway runs. Mirrors
-- infrastructure/postgres/bootstrap.sh; the passwords are container-local and
-- the container lives for one test class.
--
-- balaaca_app deliberately holds neither ownership nor BYPASSRLS: connecting as
-- the owner would make every RLS policy inert while every test still passed,
-- which is the one thing these tests exist to rule out.
CREATE ROLE balaaca_migrator LOGIN PASSWORD 'test' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE balaaca_app      LOGIN PASSWORD 'test' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE balaaca_resolver          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE balaaca_registrar         NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE balaaca_notification_worker LOGIN PASSWORD 'test' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE balaaca_moderator         NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

ALTER SCHEMA public OWNER TO balaaca_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT  USAGE  ON SCHEMA public TO balaaca_app, balaaca_notification_worker,
                                  balaaca_resolver, balaaca_registrar,
                                  balaaca_moderator;
-- ALTER FUNCTION ... OWNER TO requires membership of the target role, so
-- the migrator must be a member of every role a migration hands a function to.
GRANT balaaca_resolver, balaaca_registrar, balaaca_moderator TO balaaca_migrator;
GRANT CREATE ON DATABASE balaaca TO balaaca_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE balaaca_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO balaaca_app;
