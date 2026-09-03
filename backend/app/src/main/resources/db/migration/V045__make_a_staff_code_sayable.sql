-- A code a colleague cannot be given down a telephone.
--
-- ManageStaffService mints 32 random bytes and base64url-encodes them, which is
-- 43 characters of mixed case: wv67tgA0rT6g9flYkNTrmx3C0boFFXDdt3Ly3Fw97B4. It
-- is the whole authorisation for a seat at a business, and it was sized for
-- that. But it is ALSO the thing an owner reads out over WhatsApp or across a
-- salon, and at 43 case-sensitive characters that cannot be done - it is the
-- same defect V043 fixed for the booking reference, which the owner recognised
-- on sight.
--
-- The shape is V043's, one size up: three initials of the business, a hyphen,
-- EIGHT characters of the same thirty-one symbols. The booking reference takes
-- six because it authorises reading one appointment; this one takes eight
-- because it authorises joining a team, and the extra two are 961 times the
-- work for a guesser at no cost to the person saying it.
--
-- WHAT THIS COSTS, said plainly. 31^8 is about 2^39.6, against 2^256 before.
-- That is only defensible because two other things are true, and both are
-- checked here rather than assumed:
--
--   1. AN INVITATION EXPIRES. V021 gives it seven days, and the redemption
--      below still refuses an expired one.
--   2. GUESSING IS RATE LIMITED. AcceptStaffInvitationService now spends a
--      budget from the platform's AttemptLimiter before it ever reaches this
--      function - the same lever V043 put in front of a booking reference.
--
-- Thirty attempts per ten minutes against 8.5e11 codes, over the seven days one
-- is alive, is about one chance in thirty million. Without the limiter the
-- arithmetic is entirely different, which is why the limiter is not optional
-- and why this comment names it.

-- ---------------------------------------------------------------------------
-- Matching a code somebody typed
-- ---------------------------------------------------------------------------
-- app_booking_reference_key is reused rather than copied: it already folds
-- case, punctuation and the five confusable characters, it is IMMUTABLE, and a
-- second implementation of the same fold is a second thing to keep in step.
-- Its name says "booking" because that is what needed it first; what it does is
-- fold a spoken code, and this is the second caller.
CREATE INDEX ix_provider_staff_invitation_key
    ON provider_staff (app_booking_reference_key(invitation_token))
 WHERE invitation_token IS NOT NULL;

-- Repeated in full: CREATE OR REPLACE takes the whole body, and only the two
-- token predicates differ from what V039 wrote.
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
    --
    -- Matched on the FOLD now, so "SFA-K7M2QPXN", "sfa-k7m2qpxn" and
    -- "SFAK7M2QPXN" are one code. A colleague who was told it out loud and
    -- typed it without the hyphen has still been given it.
    SELECT ps.provider_id, ps.id INTO v_provider_id, v_staff_id
      FROM provider_staff ps
      JOIN providers p ON p.id = ps.provider_id
     WHERE app_booking_reference_key(ps.invitation_token)
             = app_booking_reference_key(p_token)
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
    -- matches nothing because the first cleared the token. Folded here too, or
    -- the claim would miss the row the SELECT above just found.
    UPDATE provider_staff
       SET user_id = v_user_id,
           invitation_token = NULL,
           invitation_expires_at = NULL,
           updated_at = now()
     WHERE id = v_staff_id
       AND app_booking_reference_key(invitation_token)
             = app_booking_reference_key(p_token);

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

-- ---------------------------------------------------------------------------
-- The initials, for the code the application is about to mint
-- ---------------------------------------------------------------------------
-- One implementation of "the three letters that stand for this business", not
-- two. The application asks for them rather than deriving them, so a code and a
-- booking reference minted the same afternoon cannot disagree about the name.
CREATE FUNCTION app_provider_initials(p_provider_id uuid) RETURNS text
LANGUAGE sql STABLE STRICT AS $fn$
    SELECT app_booking_initials(business_name) FROM providers WHERE id = p_provider_id;
$fn$;

COMMENT ON FUNCTION app_provider_initials(uuid) IS
    'The three letters a staff access code is prefixed with. A courtesy for the '
    'person saying it out loud, never a secret and never a lookup key.';
