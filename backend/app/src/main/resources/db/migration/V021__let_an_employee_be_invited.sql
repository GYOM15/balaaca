-- The STAFF role was unreachable in production.
--
-- V015 drew a line between OWNER and STAFF and nine tests hold it. But
-- provider_staff.user_id is written by exactly one thing - app_register_provider,
-- for the owner - so no employee has ever had an account, and no token has ever
-- resolved to a STAFF membership outside a test fixture.
--
-- That is the third time this shape has appeared: machinery built, tested, and
-- unreachable because nothing creates the row it needs. Registration was the
-- first, a second staff member the second.
--
-- An invitation is the missing write. It is a CAPABILITY, like a booking
-- reference: the owner mints one for a chair that already exists, hands the
-- code to the person who sits in it, and that person redeems it after signing
-- up. No email is sent - the owner already has a way to reach their own
-- employee, and a channel this platform does not yet have would only stand
-- between them.

ALTER TABLE provider_staff
    ADD COLUMN invitation_token      varchar(64),
    ADD COLUMN invitation_expires_at timestamptz;

ALTER TABLE provider_staff ADD CONSTRAINT uq_provider_staff_invitation
    UNIQUE (invitation_token);

-- Both or neither. A token with no expiry never stops working, and an expiry
-- with no token is a column that says nothing.
ALTER TABLE provider_staff ADD CONSTRAINT ck_provider_staff_invitation
    CHECK ((invitation_token IS NULL) = (invitation_expires_at IS NULL));

-- ---------------------------------------------------------------------------
-- Redeeming it
-- ---------------------------------------------------------------------------
-- The invitee has no membership yet - that is the point - so this runs with no
-- tenant bound and needs the same SECURITY DEFINER escape as signing up. Same
-- role, because it is the same privilege: writing a membership before one
-- exists.
-- The function joins providers to refuse an invitation into a suspended
-- business, and providers is FORCE RLS with no policy naming the registrar - so
-- without these the join returns nothing and every redemption is refused with a
-- permission error. Verified: that is exactly what happened first.
CREATE POLICY providers_registration_read ON providers
    FOR SELECT TO balaaca_registrar USING (true);
GRANT SELECT ON providers TO balaaca_registrar;

GRANT CREATE ON SCHEMA public TO balaaca_registrar;

CREATE OR REPLACE FUNCTION app_accept_staff_invitation(
        p_token        varchar,
        p_subject      varchar,
        p_user_id      uuid,
        p_display_name varchar,
        p_email        varchar)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user_id     uuid;
    v_provider_id uuid;
    v_staff_id    uuid;
    v_constraint  text;
BEGIN
    -- Unclaimed, unexpired, and STAFF. An owner row is not claimable by an
    -- invitation at all, and the policy below says so a second time.
    SELECT ps.provider_id, ps.id INTO v_provider_id, v_staff_id
      FROM provider_staff ps
      JOIN providers p ON p.id = ps.provider_id
     WHERE ps.invitation_token = p_token
       AND ps.invitation_expires_at > now()
       AND ps.user_id IS NULL
       AND ps.status = 'ACTIVE'
       AND ps.role = 'STAFF'
       AND p.status IN ('PENDING', 'ACTIVE');

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

ALTER FUNCTION app_accept_staff_invitation(varchar, varchar, uuid, varchar, varchar)
    OWNER TO balaaca_registrar;
REVOKE ALL ON FUNCTION app_accept_staff_invitation(varchar, varchar, uuid, varchar, varchar)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_accept_staff_invitation(varchar, varchar, uuid, varchar, varchar)
    TO balaaca_app;

-- What to tell someone who has just joined. Read with no tenant bound, because
-- at this instant the caller HAS a membership and no request has yet bound one -
-- so it goes through the read-only resolver, like every other pre-tenant read.
GRANT CREATE ON SCHEMA public TO balaaca_resolver;

CREATE OR REPLACE FUNCTION app_describe_membership(p_subject varchar)
RETURNS TABLE (provider_slug varchar, business_name varchar, display_name varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.slug, p.business_name, ps.display_name
      FROM provider_staff ps
      JOIN users u     ON u.id = ps.user_id
      JOIN providers p ON p.id = ps.provider_id
     WHERE u.keycloak_user_id = p_subject
       AND ps.status = 'ACTIVE'
       AND u.status  = 'ACTIVE'
$$;
ALTER FUNCTION app_describe_membership(varchar) OWNER TO balaaca_resolver;
REVOKE ALL ON FUNCTION app_describe_membership(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_describe_membership(varchar) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_resolver;

REVOKE CREATE ON SCHEMA public FROM balaaca_registrar;

-- The registrar may claim an UNCLAIMED STAFF row and nothing else. Not an owner
-- row, not one that already has an account, and the result must carry one -
-- so this policy cannot be used to unbind a member either.
CREATE POLICY provider_staff_invitation ON provider_staff
    FOR UPDATE TO balaaca_registrar
    USING      (user_id IS NULL AND status = 'ACTIVE' AND role = 'STAFF')
    WITH CHECK (user_id IS NOT NULL AND status = 'ACTIVE' AND role = 'STAFF');

GRANT UPDATE ON provider_staff TO balaaca_registrar;
