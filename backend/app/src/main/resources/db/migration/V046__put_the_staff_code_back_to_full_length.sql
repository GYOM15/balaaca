-- V045 is undone, deliberately and within the hour, because the reasoning
-- behind it was wrong.
--
-- V045 shortened the staff access code to three initials and eight characters
-- so an owner could say it down a telephone. That was asked for, and it was
-- the same shape V043 gave a booking reference. But the two codes are not the
-- same object, and treating them alike cost security for an ergonomic gain
-- that nobody actually needed:
--
--   A BOOKING REFERENCE opens one appointment, is held by a customer with no
--   account, may be written on paper, and may genuinely have to be read out to
--   the salon. Short is right. V043 stands.
--
--   A STAFF ACCESS CODE opens the whole business - the diary, the clientele,
--   the catalogue. It is pasted into WhatsApp by the owner, never dictated,
--   because dictating a key to a business across a salon is a bad practice in
--   itself. Length costs the person using it nothing at all.
--
-- Shortening it took the code from 2^256 to about 2^39.6 and then required an
-- attempt limiter to be defensible. That is machinery bought to repair damage
-- that was self-inflicted. The limiter stays - it is cheap and it is right
-- against a stolen-then-shared code - but it is belt and braces again rather
-- than the only thing holding the trousers up.
--
-- What the interface does instead is send a LINK carrying the code, so the
-- colleague types nothing whatever. That is less work than reading out eight
-- characters, and it does not weaken anything.

-- ---------------------------------------------------------------------------
-- Exact matching again
-- ---------------------------------------------------------------------------
-- The fold is not merely unnecessary for a base64url code; it is WRONG for one.
-- app_booking_reference_key lower-cases and maps 0, O, 1, I and L onto each
-- other. base64url is case-significant and uses every one of those characters,
-- so two distinct codes could fold to one key, and a code containing them
-- would not match itself. The index goes with it.
DROP INDEX IF EXISTS ix_provider_staff_invitation_key;

-- Repeated in full: CREATE OR REPLACE takes the whole body. This is V039's
-- text, with V045's two folded predicates returned to equality.
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
    IF v_constraint = 'users_keycloak_user_id_key' THEN
        RAISE EXCEPTION 'account already has a business' USING ERRCODE = 'Z0002';
    END IF;
    RAISE;
END;
$$;

-- Nothing calls it any more: the initials were for the short code.
-- app_booking_initials stays - V043 needs it, and it is the one that earned it.
DROP FUNCTION IF EXISTS app_provider_initials(uuid);

-- Any code minted while V045 was live is eight characters and cannot be
-- lengthened in place. There is no data to migrate on a database that has never
-- been released, and an unclaimed invitation is reissued by pressing the button
-- again - which the screen already offers, and says so.
