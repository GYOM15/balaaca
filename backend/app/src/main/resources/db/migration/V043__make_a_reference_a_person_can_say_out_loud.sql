-- A reference nobody could read off a screen or say down a telephone.
--
-- V019 minted 43 characters of base64url and called it a capability. It is a
-- good capability and a useless reference, for two reasons that were both hit
-- the first week the product was used by hand.
--
-- It is CASE-SENSITIVE, and the page renders it inside `.t-overline`, which
-- carries `text-transform: uppercase`. So what a customer copies off the screen
-- is not what the platform minted. The exact value in the database right now is
-- `1Uksca31nJzs3aiPeGCoaoRstjsGOu79wyzW3RUMqWY`; what the screen offers is
-- `1UKSCA31NJZS3AIPEGCOAORSTJSGOU79WYZW3RUMQWY`, and that answers 404. Every
-- customer of this product would have hit it.
--
-- And it cannot be dictated. In this market it must be: the customer telephones
-- the salon, or the salon telephones the customer, and one of them reads the
-- reference to the other. Forty-three characters of mixed case is not a thing a
-- person can say.
--
--
-- The shape
--
--     AAA-BBBBBB
--
-- Three initials, a hyphen, six characters. The six are drawn from 31 symbols:
-- the digits and the upper-case letters with 0, O, 1, I and L removed, because
-- those are the pairs a person hears wrong and reads wrong. Both members of each
-- pair are removed rather than one being folded onto the other, so a mis-heard
-- character produces a string that is not a reference at all, rather than a
-- string that is somebody else's reference.
--
-- Upper case only, so a telephone keyboard that auto-capitalises cannot break
-- it, and the lookup upper-cases before matching so one that does not cannot
-- break it either.
--
-- That is 31^6 = 887 503 681. It IS guessable at scale, and it is the only thing
-- authorising a stranger to read, move and cancel an appointment, so the rate
-- limit on the four customer booking routes is not optional. The 429 it answers
-- with is published in the contract alongside this.
--
--
-- The initials are a courtesy, and the fold is what makes them safe
--
-- They exist so that a customer holding three references can tell which is which
-- and a salon reading a list recognises its own. They are not a secret, they
-- carry no authority, and they are not a namespace: the whole string is the key
-- and the unique index is global.
--
-- They must therefore be the business's ACTUAL initials, which means they may
-- contain I, L and O - "Institut", "Le Salon", "Oumou" are exactly the names
-- this country has. Excluding those letters would produce initials that are not
-- the initials, which is worse than useless. So instead the LOOKUP is folded:
-- `app_booking_reference_key` maps 0 to O, and 1 and L to I, on both sides of
-- the comparison. "SIL-K7M2QP" typed as "s1l k7m2qp" resolves. The unique index
-- is on the folded form, so no two references can ever fold together, and the
-- fold can never resolve one customer's reference onto another's appointment.
--
--
-- The existing rows are REISSUED, and that is a decision with a cost
--
-- Seventeen rows: fifteen seeded, two the owner made by hand. All seventeen get
-- a new reference and the old ones stop working.
--
-- Keeping them was considered and is not possible in any useful sense. The
-- contract's `BookingReference` now publishes the new shape, so a 43-character
-- value is refused at the edge whatever the database holds; keeping it in the
-- database would preserve a value that no route accepts. And there is no
-- population of working old references to protect - the display bug above means
-- what every customer copied was already wrong.
--
-- The cost is real and it is on the operator: anybody holding an old reference
-- must be told the new one. Everyone still owed something, with the reference to
-- tell them and the number to tell it to:
--
--     SELECT a.public_reference, p.business_name, c.full_name, c.phone_e164,
--            a.starts_at
--       FROM appointments a
--       JOIN providers p ON p.id = a.provider_id
--       JOIN customers c ON c.provider_id = a.provider_id AND c.id = a.customer_id
--      WHERE a.status IN ('PENDING', 'CONFIRMED')
--        AND a.starts_at >= now()
--      ORDER BY a.starts_at;
--
-- scripts/seed/dev-bookings.sql hard-codes its own `SEED-XXXXXXXX` references
-- and they do not satisfy the new shape. That file is another agent's; it has to
-- change in the same pull request or the next `scripts/seed.sh` fails on the
-- CHECK below.
--
--
-- The column is NOT narrowed
--
-- `public_reference` stays varchar(64). Ten characters fit in it, narrowing the
-- type rewrites the table and takes an ACCESS EXCLUSIVE lock for nothing, and
-- the CHECK below states the shape more precisely than any width could.

-- ---------------------------------------------------------------------------
-- 1. The initials
-- ---------------------------------------------------------------------------
-- One implementation, in SQL, used by the backfill below and by the INSERT that
-- mints every future reference. Written here rather than in Java precisely
-- because there are two callers: two implementations of a rule that has to agree
-- are two implementations that will stop agreeing.
--
-- The rule, and it is deliberately free of heuristics:
--   fold the Latin-1 accents to their ASCII base, upper-case, and treat every
--   run of non-letters as a word break;
--   take the first letter of each of the first three words;
--   if that yields fewer than three, continue with the following letters of the
--   last word taken;
--   pad on the right with X.
--
-- "Salon Fatou" gives SFA, "Garage Camara et fils" gives GCE, "Douceur de Kipé"
-- gives DDK, "Fatou" gives FAT, "Élégance" gives ELE, and a name with no letters
-- at all gives XXX. The initials are frozen into the reference at booking: a
-- business that renames itself does not rewrite what its customers are holding.
CREATE FUNCTION app_booking_initials(p_business_name varchar) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
DECLARE
    v_words text[];
    v_head  text;
BEGIN
    -- translate rather than upper(): upper() is collation-dependent, and in a
    -- Turkish locale it turns i into a dotted capital that is not a letter this
    -- alphabet has. The map is ASCII in and ASCII out.
    v_words := regexp_split_to_array(
        btrim(regexp_replace(
            translate(
                p_business_name,
                'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöøùúûüýÿÆæŒœabcdefghijklmnopqrstuvwxyz',
                'AAAAAACEEEEIIIINOOOOOOUUUUYAAAAAACEEEEIIIINOOOOOOUUUUYYAAOOABCDEFGHIJKLMNOPQRSTUVWXYZ'),
            '[^A-Z]+', ' ', 'g')),
        ' ');

    -- regexp_split_to_array('', ' ') is {''}, not {}: a name with no letters in
    -- it lands here rather than on a subscript that does not exist.
    IF v_words[1] = '' THEN
        RETURN 'XXX';
    END IF;

    SELECT string_agg(left(v_words[i], 1), '' ORDER BY i)
      INTO v_head
      FROM generate_series(1, least(3, cardinality(v_words))) AS i;

    IF length(v_head) < 3 THEN
        v_head := v_head || substr(v_words[cardinality(v_words)], 2, 3 - length(v_head));
    END IF;

    RETURN rpad(v_head, 3, 'X');
END $fn$;

COMMENT ON FUNCTION app_booking_initials(varchar) IS
    'The three letters a booking reference is prefixed with. A courtesy for a '
    'human reading a list: not a secret, not a namespace, and not a lookup key '
    'on its own.';

-- ---------------------------------------------------------------------------
-- 2. The form a reference is MATCHED on
-- ---------------------------------------------------------------------------
-- Case, punctuation and the five confusable characters all removed, so that
-- every way a person can plausibly write down one reference lands on the same
-- key. "SIL-K7M2QP", "sil-k7m2qp", "SILK7M2QP" and "s1l k7m2qp" are one value.
--
-- The hyphen is stripped too, which is why the key is nine characters and not
-- ten: a customer who omits it, or whose keyboard produced an en dash, has
-- still given the reference.
--
-- Only the first three characters are ever affected by the fold. The six-symbol
-- alphabet excludes 0, O, 1, I and L by construction, so the map is provably the
-- identity on the body of any reference this platform mints.
--
-- IMMUTABLE, and it is used in the index expression below. It must never be
-- redefined without REINDEX INDEX uq_appointments_reference_key - a changed
-- definition would leave the index describing a fold that no longer exists.
CREATE FUNCTION app_booking_reference_key(p_reference varchar) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
    SELECT regexp_replace(
             translate(p_reference,
                       'abcdefghijklmnopqrstuvwxyzL01',
                       'ABCDEFGHIJKIMNOPQRSTUVWXYZIOI'),
             '[^0-9A-Z]', '', 'g')
$fn$;

COMMENT ON FUNCTION app_booking_reference_key(varchar) IS
    'The canonical lookup form of a booking reference. Apply it to BOTH sides '
    'of every comparison: it is not idempotent between a raw and a folded '
    'value, it is a fold, and folding only the input would stop a correctly '
    'typed reference from matching.';

-- ---------------------------------------------------------------------------
-- 3. The unique index, created BEFORE the rows are rewritten
-- ---------------------------------------------------------------------------
-- Order is deliberate. The loop below re-mints until it does not collide, and
-- what it collides WITH is this index. Creating it afterwards would leave the
-- loop with nothing to detect a collision against, and would move the failure to
-- the end of the migration where it is a crash rather than a retry.
--
-- The old references are key-unique already - they are 43 characters of base64
-- and eight hand-written seed values - so this holds over the data it is created
-- on. It is also stricter than uq_appointments_public_reference from V019, which
-- is kept: raw equality implies key equality, so that constraint is now implied,
-- and dropping it would be churn on an applied migration's object for nothing.
CREATE UNIQUE INDEX uq_appointments_reference_key
    ON appointments (app_booking_reference_key(public_reference));

-- ---------------------------------------------------------------------------
-- 4. Reissue
-- ---------------------------------------------------------------------------
-- The entropy is gen_random_uuid(), which PostgreSQL draws from the operating
-- system's cryptographic source. That matters: these are capabilities, and
-- random() is a PRNG whose state a reader of one reference could recover.
-- pgcrypto is not installed and this needs no extension.
--
-- Sixty bits reduced modulo 31^6. The bias that leaves is 8.9e8 / 1.15e18,
-- which is not a number anybody has to think about. The application mints its
-- own with SecureRandom; this is the only place SQL mints one.
DO $backfill$
DECLARE
    c_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    r          record;
    v_n        bigint;
    v_body     text;
    v_taken    boolean;
    i          int;
BEGIN
    FOR r IN SELECT a.id, app_booking_initials(p.business_name) AS initials
               FROM appointments a
               JOIN providers p ON p.id = a.provider_id
    LOOP
        v_taken := true;
        WHILE v_taken LOOP
            v_n := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint;
            v_body := '';
            FOR i IN 1..6 LOOP
                v_body := substr(c_alphabet, 1 + (v_n % 31)::int, 1) || v_body;
                v_n := v_n / 31;
            END LOOP;

            BEGIN
                UPDATE appointments
                   SET public_reference = r.initials || '-' || v_body
                 WHERE id = r.id;
                v_taken := false;
            EXCEPTION WHEN unique_violation THEN
                -- Either index. Draw again; there are 887 million to draw from.
                v_taken := true;
            END;
        END LOOP;
    END LOOP;
END $backfill$;

-- ---------------------------------------------------------------------------
-- 5. The shape, as a constraint
-- ---------------------------------------------------------------------------
-- Added after the rewrite, because it refuses every row that existed before it.
-- This is what makes the format a fact rather than a convention: the application
-- can be rewritten, and a reference of the wrong shape still cannot be stored.
ALTER TABLE appointments
    ADD CONSTRAINT ck_appointments_reference_shape
    CHECK (public_reference ~ '^[A-Z]{3}-[2-9A-HJKMNP-Z]{6}$');

COMMENT ON COLUMN appointments.public_reference IS
    'The capability, in canonical form: three initials, a hyphen, six symbols '
    'from an alphabet with 0, O, 1, I and L removed. Show it exactly as stored. '
    'Never compare it directly - compare app_booking_reference_key of it.';

-- ---------------------------------------------------------------------------
-- 6. Resolving a tenant from a reference somebody typed
-- ---------------------------------------------------------------------------
-- The same function V019 created and V039 narrowed, with the one predicate that
-- has to move. Repeated in full because CREATE OR REPLACE takes the whole body;
-- the owner, the grants and the REVOKE from PUBLIC survive it.
--
-- This is the first thing every customer booking route calls, so the fold lives
-- here as well as in the read: a route that forgot to normalise its input would
-- otherwise fail to bind a tenant and answer 404 to a reference that is right.
CREATE OR REPLACE FUNCTION app_resolve_booking_provider(p_reference varchar) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT a.provider_id
      FROM appointments a
      JOIN providers p ON p.id = a.provider_id
     WHERE app_booking_reference_key(a.public_reference)
         = app_booking_reference_key(p_reference)
       AND p.status = 'ACTIVE'
$$;
