-- There is an OWNER and nothing moves it.
--
-- Registration creates exactly one owner row and no code has ever changed a
-- role since. So a founder who sells the salon, takes a partner, or simply
-- stops being the person who deals with the platform has no way to hand it
-- over - and the only workaround is to give somebody else their password,
-- which is how one account ends up shared by three people and an audit trail
-- stops meaning anything.
--
--
-- The invariant that was never written down
--
-- "A provider has one owner" has been true since V014 by construction: the
-- registration function inserts one OWNER row and nothing else writes the
-- column. The moment a transfer exists, construction stops being the guarantee
-- and it has to become a constraint - otherwise a transfer that half-succeeds
-- leaves a business with two owners or none, and both are worse than no
-- transfer at all.
--
-- Partial, on the ACTIVE rows only: an owner who left is a DISABLED row that
-- keeps its role for the audit trail, and two of those are not a conflict.
CREATE UNIQUE INDEX uq_provider_staff_one_active_owner
    ON provider_staff (provider_id)
    WHERE role = 'OWNER' AND status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- The handover.
-- ---------------------------------------------------------------------------
--
-- One statement, because two would leave a window in which the business has no
-- owner - and the index above would refuse the second half of a botched
-- transfer, leaving the first half committed. A single UPDATE touching both
-- rows moves the role in one atomic step, and the index is then a backstop
-- rather than a trap.
--
-- Ordinary SQL and no SECURITY DEFINER: unlike moderation, this acts entirely
-- within the caller's own provider, so RLS is exactly the right confinement.
-- The tenant policy already makes the two rows visible and writable, and makes
-- another provider's staff invisible.

CREATE FUNCTION app_transfer_ownership(p_from uuid, p_to uuid)
RETURNS TABLE (o_staff_id uuid, o_display_name varchar, o_role varchar,
               o_bookable boolean, o_status varchar)
LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE v_provider uuid; v_moved int;
BEGIN
    SELECT provider_id INTO v_provider
      FROM provider_staff WHERE id = p_from AND role = 'OWNER' AND status = 'ACTIVE';

    IF v_provider IS NULL THEN
        RAISE EXCEPTION 'not the owner' USING ERRCODE = 'Z0008';
    END IF;

    -- The recipient must be able to sign in. Handing a business to a chair with
    -- no account would leave it with an owner nobody can be: the role would
    -- resolve for no subject, and the only way back would be a migration.
    IF NOT EXISTS (SELECT 1 FROM provider_staff
                    WHERE id = p_to AND provider_id = v_provider
                      AND status = 'ACTIVE' AND user_id IS NOT NULL) THEN
        RAISE EXCEPTION 'no such colleague' USING ERRCODE = 'Z0009';
    END IF;

    UPDATE provider_staff
       SET role = CASE WHEN id = p_to THEN 'OWNER' ELSE 'STAFF' END,
           updated_at = now()
     WHERE id IN (p_from, p_to);

    GET DIAGNOSTICS v_moved = ROW_COUNT;
    IF v_moved <> 2 THEN
        -- Belt and braces: p_from = p_to would move one row and leave the
        -- business owned by the same person, which is not a transfer.
        RAISE EXCEPTION 'nothing to transfer' USING ERRCODE = 'Z0009';
    END IF;

    -- The whole team back, owner first: the caller's own standing changed too,
    -- so returning only the recipient would leave the screen showing the old
    -- owner still owning it.
    RETURN QUERY
    SELECT ps.id, ps.display_name, ps.role, ps.bookable, ps.status
      FROM provider_staff ps
     WHERE ps.provider_id = v_provider AND ps.status = 'ACTIVE'
     ORDER BY (ps.role = 'OWNER') DESC, ps.display_name;
END $$;

GRANT EXECUTE ON FUNCTION app_transfer_ownership(uuid, uuid) TO balaaca_app;
