-- Nothing ever asked the person booking how they wanted to hear back.
--
-- The assumption was that WhatsApp is the channel here and e-mail would carry
-- nothing. That is wrong for a whole class of the trades this product is for:
-- a pharmacist, an optician, a garage with an account customer, all treat
-- e-mail as THE professional channel, and they want their confirmation to look
-- like one. So both are offered, and the person who knows which one is
-- actually read is the person in front of the counter, not the business.
--
-- WhatsApp and e-mail, and nothing else. SMS is in the platform's Channel
-- vocabulary, has no adapter and no account behind it, and publishing it would
-- be a promise nothing keeps.
--
-- ---------------------------------------------------------------------------
-- Why the choice rests on the APPOINTMENT and not on the customer
-- ---------------------------------------------------------------------------
-- A standing preference on `customers` was the obvious place and is the wrong
-- one, for a reason the upsert makes concrete. A booking upserts the customer
-- on (provider_id, phone_e164), so the same telephone number is the same row
-- forever. Writing the choice there means the SECOND booking rewrites the
-- first: somebody who asked for e-mail in September and for WhatsApp in
-- October would have September's cancellation notice silently re-addressed,
-- and nothing anywhere would record that the salon had agreed to something
-- else. A preference that rewrites the past is not a preference, it is a
-- correction applied to messages nobody agreed to correct.
--
-- The appointment is also the thing the choice is ABOUT. A reminder is owed
-- days after the booking and a cancellation notice can be owed weeks after it;
-- both are messages about one appointment, and the answer they need is the one
-- given when THAT appointment was made. This is the same argument V044 settled
-- for `service_fulfilment`: what the customer chose is frozen onto the row,
-- because the source it could otherwise be re-derived from has moved on.
--
-- The notification row keeps its own copy regardless, and that is not
-- duplication. A row in `notifications` is a self-contained snapshot by rule:
-- the worker's database role is granted SELECT and UPDATE on this one table
-- and cannot read `appointments` or `customers` at all, so a pointer would be
-- a pointer it can never follow. The appointment column is what a message
-- planned LATER is built from; the notification column is what the worker
-- sends by.
--
-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- No new table, so no new policies. Both tables carry provider_id, both are
-- already ENABLE plus FORCE ROW LEVEL SECURITY, and RLS filters rows rather
-- than columns: a column added to a protected table is protected by the
-- policies already on it, and inventing a second one here would only be a
-- second place to get the predicate wrong.
--
-- The backfills below run as balaaca_migrator, which FORCE binds like any
-- other role. They match rows only because `appointments_maintenance` (V015)
-- and `notifications_maintenance` (V013) exist. Without those an UPDATE here
-- would touch zero rows and report success, which is the failure mode V015 was
-- written to close.

-- ---------------------------------------------------------------------------
-- 1. The appointment remembers what was chosen for it
-- ---------------------------------------------------------------------------
ALTER TABLE appointments
    ADD COLUMN preferred_channel varchar(20);

-- Every booking taken before today meant WhatsApp: it is the only channel the
-- worker has ever had an adapter for, and it is what the absent field still
-- means on the wire. Backfilled explicitly rather than left to the DEFAULT so
-- the rows say it, and so the NOT NULL below cannot fail on a live database.
UPDATE appointments SET preferred_channel = 'WHATSAPP' WHERE preferred_channel IS NULL;

ALTER TABLE appointments
    ALTER COLUMN preferred_channel SET DEFAULT 'WHATSAPP',
    ALTER COLUMN preferred_channel SET NOT NULL,
    ADD CONSTRAINT ck_appointments_preferred_channel
        CHECK (preferred_channel IN ('WHATSAPP','EMAIL'));

-- ---------------------------------------------------------------------------
-- 2. The message carries it to the worker
-- ---------------------------------------------------------------------------
-- Distinct from `channel_used`, and both are needed. This one is what the
-- customer asked for, frozen at planning time; that one is what the send
-- actually went out on, written by the worker after the acknowledgement. A
-- single column would lose the difference between an intention and an outcome,
-- and the difference is the whole point of a fallback.
ALTER TABLE notifications
    ADD COLUMN preferred_channel varchar(20);

-- Read out of the row rather than defaulted flat. A provider that published
-- only an e-mail address already has notices addressed to it, and stamping
-- those WHATSAPP would make ck_notifications_reachable refuse rows that are
-- perfectly deliverable.
UPDATE notifications
   SET preferred_channel = CASE WHEN to_phone_e164 IS NOT NULL THEN 'WHATSAPP'
                                ELSE 'EMAIL' END
 WHERE preferred_channel IS NULL;

ALTER TABLE notifications
    ALTER COLUMN preferred_channel SET DEFAULT 'WHATSAPP',
    ALTER COLUMN preferred_channel SET NOT NULL,
    ADD CONSTRAINT ck_notifications_preferred_channel
        CHECK (preferred_channel IN ('WHATSAPP','EMAIL'));

-- ck_notifications_destination already refuses a row addressed to nowhere.
-- This refuses the subtler one: a row whose preferred channel has no address,
-- which the old constraint accepts because the OTHER address is present. That
-- row is not a message, it is a decision deferred to a worker that has no way
-- to make it and no way to report that it could not.
ALTER TABLE notifications
    ADD CONSTRAINT ck_notifications_reachable
        CHECK ((preferred_channel = 'WHATSAPP' AND to_phone_e164 IS NOT NULL)
            OR (preferred_channel = 'EMAIL'    AND to_email      IS NOT NULL));
