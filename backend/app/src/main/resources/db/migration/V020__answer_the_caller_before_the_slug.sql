-- The error a signup returned depended on somebody else's business.
--
-- app_register_provider inserted the provider row first, so the slug was
-- arbitrated before the caller was. An account that ALREADY had a business
-- therefore learned, for any handle it named:
--
--   taken  -> Z0001 SLUG_UNAVAILABLE
--   free   -> Z0002 ALREADY_REGISTERED
--
-- Two different answers, decided entirely by a fact about another provider.
-- Verified against 18.6. That is an existence oracle over the whole slug
-- namespace, available to any account, unlimited, for ever - and it is wrong on
-- its own terms too: a provider who already runs a salon should be told that,
-- not told something about a stranger's handle.
--
-- The caller is now answered first. Whatever slug they name, an account with a
-- business gets ALREADY_REGISTERED and learns nothing.
--
-- What this does NOT close: an account with no business can still probe, the
-- way every signup form that says "that name is taken" can be probed. Closing
-- that needs a rate limit rather than a different error, and RATE_LIMITED is
-- already in the published catalogue waiting for one.
--
-- The ORDER OF THE TWO INSERTS is untouched, and must stay untouched: the
-- provider row still goes in before the staff row, so a caller passing an
-- existing provider's id fails on providers_pkey before any membership is
-- written. What is added here is a SELECT, not an insert.
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

    -- Before the slug, and deliberately. The unique index is still what settles
    -- a race - two taps on a slow connection both read no membership and both
    -- try to write one - so this is for the ANSWER, not for the guarantee.
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
