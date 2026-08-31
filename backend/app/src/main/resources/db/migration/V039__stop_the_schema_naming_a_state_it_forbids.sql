-- Two kinds of dead text, removed together because they are the same mistake.
--
--
-- One: four objects still ask for a standing the CHECK now refuses
--
-- V035 left providers.status with ACTIVE and SUSPENDED, and moved the two
-- policies a suspension has to travel through. Four objects were not moved, and
-- they read `status IN ('PENDING', 'ACTIVE')`.
--
-- Their BEHAVIOUR is already correct and has been since V035: PENDING is
-- unreachable, so the list means ACTIVE alone, and SUSPENDED is excluded from
-- all four exactly as it should be. Nothing was broken and nothing is fixed
-- here. What is removed is the lie: somebody reading
-- app_resolve_published_provider today would conclude that a pending business
-- is publicly reachable, and would be wrong about a product decision.
--
-- The rule this repository keeps rediscovering is that a schema which names a
-- state nothing can produce teaches the next reader something untrue. It cost
-- an afternoon when the state was providers.status itself; it costs nothing to
-- remove here, so it is removed here.
--
-- Deliberately NOT touched: app_refuse_orphaning_appointments and
-- app_review_provider_report also contain the word PENDING. Theirs is an
-- APPOINTMENT status and a REPORT status, both perfectly reachable. Grepping
-- for a string is not the same as knowing what it means.
--
--
-- Two: two columns nothing writes, published on every public page
--
-- providers.latitude and providers.longitude have existed since V004, no code
-- has ever written them, and PublicProviderView publishes both - so every
-- provider page has carried two null fields for as long as there have been
-- pages.
--
-- They are not waiting for a feature. V031 refused coordinates explicitly and
-- wrote down why: a latitude and longitude is a surveillance-grade fact about a
-- private address, nothing in this product reads one, and a column that exists
-- will eventually be filled - most likely from a browser geolocation prompt
-- somebody clicked through. Geography here is the closed locality map plus a
-- free-text quartier, and that decision is three migrations old.
--
-- Keeping empty columns for a design that was rejected is how a schema acquires
-- a shape nobody chose.

-- ---------------------------------------------------------------------------
-- The four objects.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_resolve_published_provider(p_slug varchar) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM providers
     WHERE slug = p_slug AND published AND status = 'ACTIVE'
$$;

CREATE OR REPLACE FUNCTION app_resolve_booking_provider(p_reference varchar) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT a.provider_id
      FROM appointments a
      JOIN providers p ON p.id = a.provider_id
     WHERE a.public_reference = p_reference
       AND p.status = 'ACTIVE'
$$;

-- Repeated in full: CREATE OR REPLACE takes the whole body, and only the one
-- predicate differs from what V021 wrote.
CREATE OR REPLACE FUNCTION app_accept_staff_invitation(
        p_token varchar, p_subject varchar, p_user_id uuid,
        p_display_name varchar, p_email varchar)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user_id     uuid;
    v_provider_id uuid;
    v_staff_id    uuid;
    v_constraint  text;
BEGIN
    -- Unclaimed, unexpired, and STAFF. An owner row is not claimable by an
    -- invitation at all, and the policy elsewhere says so a second time.
    SELECT ps.provider_id, ps.id INTO v_provider_id, v_staff_id
      FROM provider_staff ps
      JOIN providers p ON p.id = ps.provider_id
     WHERE ps.invitation_token = p_token
       AND ps.invitation_expires_at > now()
       AND ps.user_id IS NULL
       AND ps.status = 'ACTIVE'
       AND ps.role = 'STAFF'
       AND p.status = 'ACTIVE';

    IF v_provider_id IS NULL THEN
        -- Unknown, expired, already claimed and belonging to a suspended
        -- business are one answer. Telling them apart would say whether a code
        -- ever existed, to anyone who guesses one.
        RAISE EXCEPTION 'no such invitation' USING ERRCODE = 'Z0003';
    END IF;

    SELECT id INTO v_user_id FROM users WHERE keycloak_user_id = p_subject;

    -- Answered before the invitation is spent, for the same reason V020 answers
    -- the caller before the handle: a person who already works somewhere should
    -- be told that, not left wondering why a valid code failed.
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

    -- Spent in the same statement that claims it, so a code cannot be redeemed
    -- twice by two people who read it at the same moment: the second UPDATE
    -- matches nothing because the first cleared the token.
    UPDATE provider_staff
       SET user_id = v_user_id,
           invitation_token = NULL,
           invitation_expires_at = NULL,
           updated_at = now()
     WHERE id = v_staff_id
       AND invitation_token = p_token;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such invitation' USING ERRCODE = 'Z0003';
    END IF;

    RETURN v_provider_id;

EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IN ('uq_provider_staff_one_active_membership',
                        'users_keycloak_user_id_key') THEN
        RAISE EXCEPTION 'account already has a business' USING ERRCODE = 'Z0002';
    END IF;
    RAISE;
END $$;

-- CREATE OR REPLACE VIEW cannot change a column list, and this one does not, so
-- it replaces cleanly. security_invoker survives a replace; the grant does too.
CREATE OR REPLACE VIEW provider_category_counts AS
    SELECT c.id AS category_id,
           count(p.id) FILTER (
               WHERE p.published AND p.status = 'ACTIVE'
           )::int AS provider_count
      FROM provider_categories c
      LEFT JOIN providers p ON p.category_id = c.id
     GROUP BY c.id;

-- ---------------------------------------------------------------------------
-- The two columns.
-- ---------------------------------------------------------------------------

ALTER TABLE providers DROP COLUMN latitude;
ALTER TABLE providers DROP COLUMN longitude;
