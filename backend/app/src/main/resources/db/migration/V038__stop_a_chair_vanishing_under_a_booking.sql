-- An employee can be marked as having left while customers are still booked
-- with them.
--
-- `replaceStaffMember` accepts `active: false` and has since the team routes
-- were written. Nothing looks at the diary first, so a salon that ticks the box
-- on a Friday leaves every appointment already made with that person pointing
-- at a chair that is no longer bookable: the customer still holds a reference
-- and still turns up, the agenda still lists the row, and the only person who
-- knows the appointment is orphaned is the one who ticked the box.
--
--
-- Why this is a trigger and not a check in the service
--
-- Two reasons, and the first is the ordinary one for this codebase: a rule the
-- database holds cannot be forgotten by a future path. The second is
-- structural. The rule is a `providers` rule that needs a `booking` fact, and
-- `booking` already depends on `providers` - the outbox reads the notice
-- profile from it. Java modules cannot depend on each other in a circle, so
-- expressing this in the providers service would mean either inverting a port
-- into the composition root or reading another context's table from Java. The
-- constraint is genuinely about two tables agreeing, which is the one thing the
-- database is unambiguously for.
--
--
-- Why it REFUSES rather than repairing
--
-- The two automatic repairs are both worse than the refusal. Cancelling the
-- appointments punishes the customer for the salon's staffing; silently moving
-- them to another chair sends somebody to a person they did not choose, which
-- they discover in the chair.
--
-- Both of those are things the provider can already do, deliberately, with
-- routes that exist: move the appointment to a colleague, or cancel it - which
-- notifies the customer, as it should. The refusal simply makes them choose.

CREATE FUNCTION app_refuse_orphaning_appointments()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_upcoming int;
BEGIN
    -- Only the transition INTO inactive, and only when it is a real change: a
    -- provider editing the display name of somebody who left months ago must
    -- not be refused because of appointments that are already in the past.
    IF NEW.status = 'ACTIVE' OR OLD.status <> 'ACTIVE' THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_upcoming
      FROM appointments
     WHERE staff_id = NEW.id
       AND status IN ('PENDING', 'CONFIRMED')
       AND starts_at >= now();

    IF v_upcoming > 0 THEN
        RAISE EXCEPTION 'staff member has % upcoming appointment(s)', v_upcoming
            USING ERRCODE = 'Z0006';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_provider_staff_no_orphaned_appointments
    BEFORE UPDATE OF status ON provider_staff
    FOR EACH ROW
    EXECUTE FUNCTION app_refuse_orphaning_appointments();

-- The function runs as the invoking role and reads `appointments`, which is
-- FORCE RLS. That is exactly right: the rows it counts are the ones the caller
-- can already see, which are their own provider's, and a trigger that could
-- count across tenants would be a way to learn how busy somebody else is.
