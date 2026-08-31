-- providers.status described a life nobody had built.
--
-- Four values - PENDING, ACTIVE, SUSPENDED, CLOSED - a default of PENDING, and
-- no line of Java that ever writes the column. Every salon that has ever
-- registered is PENDING and always will be; ACTIVE is never reached; SUSPENDED
-- and CLOSED cannot be reached at all. It was invisible because the public read
-- policy admits PENDING and ACTIVE alike, so a permanently-pending business is
-- fully visible and nothing looks wrong.
--
-- The founder has now decided the question the column was quietly assuming:
-- Balaaca does NOT vet a business before it appears. A salon that registers and
-- publishes is live immediately. He is the only operator, a validation queue
-- nobody empties turns away exactly the salons the product wants, and a
-- dishonest business passes a form check without difficulty - what shows it is
-- behaviour, afterwards. So the useful lever is the sanction, not the filter.
--
-- That decision removes two of the four values.
--
-- PENDING meant "waiting to be let in", and nobody is waiting.
--
-- CLOSED meant "this business has shut down", and `published` already says
-- exactly that, is already writable by the provider, and already hides the page
-- everywhere. A second way to express one fact is a second way for the two to
-- disagree.
--
-- What is left is a standing: ACTIVE, or SUSPENDED by the platform. Both are
-- written by real code paths in V036, which is the point - a state no code can
-- produce is not a state, it is a comment in the wrong file.

-- Everybody who registered under the old default is simply live. That is what
-- they already were: the read policy never distinguished them.
UPDATE providers SET status = 'ACTIVE' WHERE status <> 'ACTIVE';

ALTER TABLE providers ALTER COLUMN status SET DEFAULT 'ACTIVE';

-- Discovered by name rather than assumed: the CHECK was written inline in V004
-- and PostgreSQL named it, so hardcoding a guess here would work on this
-- database and fail on a rebuilt one.
DO $$
DECLARE constraint_name text;
BEGIN
    SELECT con.conname INTO constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'providers'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%status%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE providers DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE providers
    ADD CONSTRAINT ck_providers_status CHECK (status IN ('ACTIVE', 'SUSPENDED'));

-- ---------------------------------------------------------------------------
-- The two policies that named PENDING.
-- ---------------------------------------------------------------------------
--
-- Both have to move in the same migration as the CHECK. A policy still
-- admitting a value the CHECK now forbids is dead text, and the day somebody
-- reads it to learn what is public it teaches them something untrue.

-- V014 gave the registrar `WITH CHECK (NOT published AND status = 'PENDING')`,
-- so leaving this alone would break signing up outright: the policy demands a
-- value the CHECK above now refuses, and every registration would fail at the
-- INSERT. Dormancy was never really carried by the status anyway - it is
-- `NOT published` that keeps a new business off the public path, which is why
-- that half is kept exactly as it was.
DROP POLICY providers_registration ON providers;

CREATE POLICY providers_registration ON providers
    FOR INSERT TO balaaca_registrar
    WITH CHECK (NOT published AND status = 'ACTIVE');

DROP POLICY providers_public_read ON providers;

CREATE POLICY providers_public_read ON providers
    FOR SELECT
    USING (published
           AND status = 'ACTIVE'
           AND app_current_provider() IS NULL);

DROP POLICY service_offerings_public_read ON service_offerings;

CREATE POLICY service_offerings_public_read ON service_offerings
    FOR SELECT
    USING (active
           AND app_current_provider() IS NULL
           AND provider_id IN (SELECT id FROM providers
                                WHERE published AND status = 'ACTIVE'));

-- Why suspending is enough, everywhere, with no other policy touched: every
-- other public path binds the provider from its slug first, and the binder
-- reads `providers` with no tenant - which is this policy. A suspended business
-- therefore fails to resolve, and its page, its hours, its team, its slots and
-- its booking route all answer 404 together. One predicate, one behaviour.
