-- A date could carry only one kind of exception, and only one row of it.
--
-- availability_overrides accepted CLOSED and CUSTOM_HOURS. "I am away on
-- Thursday from two to three" is neither: CLOSED takes the whole Thursday away,
-- and CUSTOM_HOURS makes the provider restate the entire day by hand as two
-- windows - which the reader then discarded anyway, because it took the first
-- row it found for a date and dropped the rest. So the second window was
-- accepted with 201 and silently ignored, and the salon showed slots during an
-- absence it had declared.
--
-- TIME_OFF says the one thing that was missing: keep the day's hours and take
-- this window out of them. It carries times exactly as CUSTOM_HOURS does, so
-- the shape check is the same for both.
ALTER TABLE availability_overrides
    DROP CONSTRAINT ck_availability_overrides_shape;

-- The kind check was written inline on the column in V008, so PostgreSQL named
-- it rather than we. Found rather than guessed: the generated name is stable in
-- practice but is not part of any contract, and a DROP naming it wrongly would
-- fail the migration on a cluster that spelled it otherwise.
DO $$
DECLARE
    generated text;
BEGIN
    SELECT conname INTO generated
      FROM pg_constraint
     WHERE conrelid = 'availability_overrides'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%kind%'
       AND conname <> 'ck_availability_overrides_shape';

    IF generated IS NOT NULL THEN
        EXECUTE format('ALTER TABLE availability_overrides DROP CONSTRAINT %I',
                       generated);
    END IF;
END $$;

ALTER TABLE availability_overrides
    ADD CONSTRAINT ck_availability_overrides_kind
        CHECK (kind IN ('CLOSED', 'CUSTOM_HOURS', 'TIME_OFF'));

-- Stated over the two kinds that carry a window rather than over CUSTOM_HOURS
-- alone. A check written as "not CLOSED implies times" would admit a fourth
-- kind by silence the day one is added; this one refuses it until somebody
-- names it here.
ALTER TABLE availability_overrides
    ADD CONSTRAINT ck_availability_overrides_shape CHECK (
        (kind = 'CLOSED' AND start_time IS NULL AND end_time IS NULL)
        OR (kind IN ('CUSTOM_HOURS', 'TIME_OFF')
            AND start_time IS NOT NULL AND end_time IS NOT NULL
            AND start_time <> end_time));

-- Several rows per date are now the point, so nothing here makes the date
-- unique. The lookup index already covers (provider_id, staff_id,
-- override_date), which is the read the calculator makes.
