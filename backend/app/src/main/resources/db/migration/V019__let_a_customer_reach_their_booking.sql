-- A customer could book and then do nothing at all.
--
-- Six public routes existed - search, page, hours, team, slots, book - and none
-- for looking at what you booked or calling it off. The customer telephoned the
-- salon, which is the thing this product exists to remove.
--
-- What that needs is a way to reach one appointment without an account, because
-- customers do not have one and will not be made to. So: a capability. A long
-- random reference, minted at booking, sent to the customer, and useless for
-- anything but that one appointment.

-- ---------------------------------------------------------------------------
-- The reference
-- ---------------------------------------------------------------------------
-- Not the appointment's id. The id is on the provider's agenda, in the audit
-- trail and in log lines; a capability has to be a value whose only job is to be
-- a capability, so that widening what the id is used for never widens what the
-- id can do.
--
-- Added nullable, backfilled, then made NOT NULL - the ordinary shape, even
-- though no production row exists yet, because a migration that assumes an
-- empty table is a migration that fails the first time it is not.
ALTER TABLE appointments ADD COLUMN public_reference varchar(64);

-- 256 bits from two v4 uuids. pgcrypto is not installed and this needs no
-- extension; the application mints its own with SecureRandom, and this is only
-- for rows that predate the column.
UPDATE appointments
   SET public_reference = replace(gen_random_uuid()::text, '-', '')
                       || replace(gen_random_uuid()::text, '-', '')
 WHERE public_reference IS NULL;

ALTER TABLE appointments ALTER COLUMN public_reference SET NOT NULL;
ALTER TABLE appointments ADD CONSTRAINT uq_appointments_public_reference
    UNIQUE (public_reference);

-- ---------------------------------------------------------------------------
-- Resolving a tenant from it
-- ---------------------------------------------------------------------------
-- The same circularity as every other public entry point: appointments is
-- tenant-scoped under FORCE RLS, and the customer has no tenant to bind. A
-- SECURITY DEFINER function owned by the read-only resolver turns the reference
-- into the one provider it belongs to, and the request proceeds bound to that
-- tenant like any other.
--
-- It returns nothing for a reference that does not exist, so an unknown
-- reference and one belonging to a provider that has since been suspended are
-- the same 404 - and neither says which.
GRANT CREATE ON SCHEMA public TO balaaca_resolver;

CREATE OR REPLACE FUNCTION app_resolve_booking_provider(p_reference varchar) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT a.provider_id
      FROM appointments a
      JOIN providers p ON p.id = a.provider_id
     WHERE a.public_reference = p_reference
       AND p.status IN ('PENDING', 'ACTIVE')
$$;
ALTER FUNCTION app_resolve_booking_provider(varchar) OWNER TO balaaca_resolver;
REVOKE ALL ON FUNCTION app_resolve_booking_provider(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_booking_provider(varchar) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_resolver;

-- The function reads two tenant-scoped tables with nothing bound, so both need a
-- policy naming the resolver. providers already has one from V015.
CREATE POLICY appointments_resolution ON appointments
    FOR SELECT TO balaaca_resolver USING (true);

GRANT SELECT ON appointments TO balaaca_resolver;
