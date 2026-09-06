-- The one question the signup form never asked.
--
-- `providers.description` has existed since V004 and the public page has drawn
-- it since the public page existed. Nothing ever collected it at the door: a
-- business registered, landed on an empty dashboard, and its page said its name
-- and nothing else until somebody found the profile form. The field a customer
-- reads first was the field the product asked for last.
--
-- It stays OPTIONAL, and that is a decision rather than an oversight. A
-- mandatory paragraph is a wall in front of the one screen that has to be easy,
-- and a business that has nothing prepared will type "salon" to get past it -
-- which is worse than an absent section, because an absent section draws
-- nothing while "salon" draws a heading over one word.
--
--
-- Why this is a DROP and not a CREATE OR REPLACE
--
-- `CREATE OR REPLACE FUNCTION` matches on the name AND the argument types, so
-- naming a new parameter list does not replace anything: it creates an
-- OVERLOAD, and both would then exist. That is not merely untidy. V014's
-- `REVOKE ALL ... FROM PUBLIC` names the OLD signature, so the new overload
-- would keep PostgreSQL's default, which is EXECUTE to PUBLIC - a SECURITY
-- DEFINER function that registers a business, callable by every role on the
-- cluster, with the migration reporting success.
--
-- So: drop the old signature by its exact types, create the new one, and
-- restate the owner, the REVOKE and the GRANT. All three, because a dropped
-- function takes its privileges with it.
--
-- The CREATE grant is lent and taken back the same way V051 lends it to the
-- moderator: `ALTER FUNCTION ... OWNER TO` needs the receiving role to hold
-- CREATE on the schema, and V014 revoked it from the registrar on its last
-- line.

DROP FUNCTION app_register_provider(varchar, uuid, varchar, varchar, uuid,
                                    varchar, varchar, uuid, varchar, varchar,
                                    uuid);

GRANT CREATE ON SCHEMA public TO balaaca_registrar;

CREATE FUNCTION app_register_provider(
        p_subject       varchar,
        p_user_id       uuid,
        p_display_name  varchar,
        p_email         varchar,
        p_provider_id   uuid,
        p_slug          varchar,
        p_business_name varchar,
        p_description   varchar,
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

    -- Before the slug, and deliberately. V020 has the argument: the answer a
    -- signup returns must not depend on a fact about somebody else's business.
    IF v_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM provider_staff
             WHERE user_id = v_user_id AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'account already has a business' USING ERRCODE = 'Z0002';
    END IF;

    IF v_user_id IS NULL THEN
        INSERT INTO users (id, keycloak_user_id, display_name, email)
             VALUES (p_user_id, p_subject, p_display_name, p_email);
        v_user_id := p_user_id;
    END IF;

    -- The ORDER OF THE TWO INSERTS is untouched and must stay untouched: the
    -- provider row goes in before the staff row, so a caller passing an
    -- existing provider's id fails on providers_pkey before any membership is
    -- written.
    --
    -- nullif(btrim(...)) rather than the raw parameter, so no caller can store
    -- a description made of spaces. An absent section and a section holding one
    -- space render differently, and only one of them is what the provider
    -- meant.
    INSERT INTO providers (id, slug, business_name, description, category_id,
                           city, timezone)
         VALUES (p_provider_id, p_slug, p_business_name,
                 nullif(btrim(p_description), ''), p_category_id,
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
                                     varchar, varchar, varchar, uuid, varchar,
                                     varchar, uuid) OWNER TO balaaca_registrar;
REVOKE ALL ON FUNCTION app_register_provider(varchar, uuid, varchar, varchar,
                                             uuid, varchar, varchar, varchar,
                                             uuid, varchar, varchar, uuid)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_register_provider(varchar, uuid, varchar, varchar,
                                                uuid, varchar, varchar, varchar,
                                                uuid, varchar, varchar, uuid)
    TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_registrar;
