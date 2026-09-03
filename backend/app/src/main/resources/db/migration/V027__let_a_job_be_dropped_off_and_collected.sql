-- The product could say one thing: "I sit down and I wait".
--
-- So an alteration claimed to be a forty-five minute chair, and couture has been
-- in the taxonomy since V016. The trade does the opposite: you hand the work
-- over, you leave, you come back. A garage, a phone repairer and a dry cleaner
-- all work that way, and none of them could be served.
--
-- THE BOOKED SLOT REMAINS THE HANDOVER. It is the only moment when the customer
-- and one of the provider's people occupy each other, and it is exactly what
-- no_double_booking protects. Nothing about that constraint moves.
--
-- The workshop delay does NOT enter blocked_range and must never enter it: the
-- constraint models a serialised resource, and a tailor works on twelve boubous
-- at once. A seventy-two hour range would forbid the other eleven.
--
-- The collection is not booked either. That is the settled point, and it is what
-- every piece of software in these trades already does: a status change and a
-- message, never a second slot. A pickup appointment would consume a chair for
-- something nobody schedules - the customer comes by during opening hours - and
-- it cannot be planned at drop-off anyway, since on Tuesday the tailor does not
-- know which ten minutes of Friday the customer will choose. A customer who
-- found no collection slot could then not drop off either, refused by a
-- constraint we invented.

-- ---------------------------------------------------------------------------
-- 1. The offering says which shape it is
-- ---------------------------------------------------------------------------
-- One column, and its NULLNESS is the discriminant: NULL is sit-and-wait,
-- non-NULL is drop-off. The illegal states - a drop-off with no delay, a seated
-- service with one - are not representable, which is cheaper than a second
-- column and a CHECK tying the two together.
--
-- Hours, not days and not minutes. A dry cleaner in Conakry promises "tomorrow
-- at five" and same-day at six hours exists, so a day is too coarse; a minute is
-- false precision that would invite someone to write 45 and recreate the very
-- bug this fixes. 2160 is ninety days.
ALTER TABLE service_offerings
    ADD COLUMN turnaround_hours int
        CHECK (turnaround_hours > 0 AND turnaround_hours <= 2160);

COMMENT ON COLUMN service_offerings.turnaround_hours IS
    'Announced workshop delay. NULL: on-site service, and duration_minutes is '
    'the time seated. Not NULL: drop-off, and duration_minutes becomes the time '
    'of the HANDOVER at the counter, not the time of the work.';

-- ---------------------------------------------------------------------------
-- 2. The appointment freezes it, and carries the promise
-- ---------------------------------------------------------------------------
ALTER TABLE appointments
    -- Frozen at booking, like the price and the buffers: re-announcing 24 hours
    -- tomorrow must not rewrite the 72 promised yesterday. It is also what keeps
    -- a past appointment recognisable as a drop-off when the offering is edited
    -- or retired.
    ADD COLUMN turnaround_hours int CHECK (turnaround_hours > 0),

    -- The living promise, movable. Computed at booking from turnaround_hours,
    -- then moved by the provider: "the machine broke, it will be Friday" is the
    -- most frequent event of these trades. Not a generated column - a generated
    -- one could not be moved, and timestamptz + interval is only STABLE, which
    -- PostgreSQL refuses in a generated column with 42P17. The buffers of V009
    -- hit the same wall for the same reason.
    ADD COLUMN ready_by timestamptz,

    -- The fact, not the promise. Deliberately NOT a status: AppointmentStatus is
    -- published, clients branch on it, and "ready" is not a state of the
    -- appointment - the appointment happened when the customer handed the work
    -- over. It is a fact about the work.
    ADD COLUMN ready_at timestamptz;

ALTER TABLE appointments
    -- The two travel together or not at all.
    ADD CONSTRAINT ck_appointments_turnaround_pair
        CHECK ((turnaround_hours IS NULL) = (ready_by IS NULL)),
    -- A promise cannot precede the handover that created it.
    ADD CONSTRAINT ck_appointments_ready_after_handover
        CHECK (ready_by IS NULL OR ready_by >= ends_at),
    -- Nothing is "ready" on a service where the customer stayed in the chair.
    ADD CONSTRAINT ck_appointments_ready_only_on_dropoff
        CHECK (ready_at IS NULL OR turnaround_hours IS NOT NULL);

-- What the provider's board reads: what is late, and what is due today. Partial,
-- because it is only ever asked of work still owed.
CREATE INDEX ix_appointments_ready_by ON appointments (provider_id, ready_by)
    WHERE ready_by IS NOT NULL AND ready_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. No backfill for couture, and that is a decision
-- ---------------------------------------------------------------------------
-- The column is nullable with no DEFAULT, so every existing row stays valid and
-- every past appointment keeps its meaning. There is nothing to rewrite for the
-- schema to be correct.
--
-- But nothing here fills turnaround_hours for the couture already in the
-- database, and pretending otherwise would be worse than the bug. Twenty-four
-- hours or seventy-two is a commercial promise each tailor makes, not a value to
-- infer. Worse, the rows cannot even be identified: a FITTING is a genuine
-- seated appointment in that trade, so among one tailor's offerings "Retouche
-- ourlet" and "Essayage robe" are indistinguishable from the data. A backfill
-- would write a promise no tailor made, to customers who would travel for it.
--
-- It is an operator's task, one provider at a time, and the query that finds
-- them is:
--     SELECT p.slug, o.name, o.duration_minutes
--       FROM service_offerings o
--       JOIN providers p ON p.id = o.provider_id
--       JOIN provider_categories c ON c.id = p.category_id
--      WHERE c.slug = 'couture' AND o.turnaround_hours IS NULL;
