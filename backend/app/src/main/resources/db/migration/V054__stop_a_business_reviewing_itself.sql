-- A business may not review itself from its own published number.
--
-- Booking your own service is legitimate and stays allowed: an owner books for
-- their mother, and the owner of this platform books on his own page every day
-- to check the flow works. Writing the review afterwards is not, and that is
-- where the refusal belongs. Refusing the BOOKING would have broken the one
-- person who tests it most.
--
-- Name it for what it is: a speed bump, not a lock. A second SIM card walks
-- straight past it. What it stops is the unthinking attempt - the provider who
-- reaches for the phone in their hand - which is the one that actually happens.
-- A real defence would need verified identity, which a customer in Conakry does
-- not have and will not be asked for. Everything beyond this is the sanction
-- and the report, which is the decision already taken.
--
-- The comparison is on E.164 and on nothing else. Every column here is
-- normalised by PhoneNumber.parse before it is stored, so two spellings of one
-- number are one string; a LIKE or a suffix match would refuse a customer whose
-- number merely ends the same way.
--
-- BOTH published numbers, not just the public one. A business publishes a
-- telephone and a WhatsApp, and in this market the WhatsApp is the one actually
-- in the owner's hand - comparing only public_phone_e164 would have left the
-- likelier of the two as a free pass, which is a speed bump with a gap in it.

-- Two columns, not the table. balaaca_moderator owns every review function and
-- had no privilege on `customers` at all - the first run of this migration came
-- back "permission denied for table customers", which is the right answer to a
-- role reaching somewhere it has no business being. A blanket
-- `GRANT SELECT ON customers` would have fixed the error and widened that role
-- to every customer's name, e-mail and visit count for the sake of comparing
-- one string.
--
-- Row-level security still applies on top: `customers_tenant` confines even
-- this to the provider the reference bound. The grant says which COLUMNS, the
-- policy says which ROWS, and neither substitutes for the other.
GRANT SELECT (id, phone_e164) ON customers TO balaaca_moderator;

CREATE OR REPLACE FUNCTION app_submit_review(p_reference varchar, p_rating smallint,
                                             p_comment varchar)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_provider uuid; v_appointment uuid; v_service varchar; v_month date;
    v_status varchar; v_ends_at timestamptz; v_id uuid; v_is_the_business boolean;
BEGIN
    SELECT a.provider_id, a.id, a.service_name, a.status, a.ends_at,
           -- The provider's own timezone. In any other one, "September" is a
           -- fact about the reader rather than about the appointment.
           date_trunc('month', a.starts_at AT TIME ZONE p.timezone)::date,
           -- NULL-safe throughout: a provider who published no number and a
           -- customer row without one must not collide into "the same number".
           c.phone_e164 IS NOT NULL
               AND c.phone_e164 IN (coalesce(p.public_phone_e164, ''),
                                    coalesce(p.whatsapp_phone_e164, ''))
      INTO v_provider, v_appointment, v_service, v_status, v_ends_at, v_month,
           v_is_the_business
      FROM appointments a
      JOIN providers p ON p.id = a.provider_id
      LEFT JOIN customers c ON c.id = a.customer_id
     WHERE a.public_reference = p_reference;

    IF v_appointment IS NULL THEN
        RAISE EXCEPTION 'no such booking' USING ERRCODE = 'Z0005';
    END IF;

    -- Before the readiness check, not after. A provider who booked themselves
    -- for next Thursday should be told now that this will never be reviewable,
    -- rather than "not yet" - which would be an invitation to come back.
    IF v_is_the_business THEN
        RAISE EXCEPTION 'the business is reviewing itself' USING ERRCODE = 'Z0013';
    END IF;

    -- Over, and served. Not `status = 'COMPLETED'`: completion is a button the
    -- provider presses and a busy salon does not press it, so that rule would
    -- have gated the whole feature behind an action nobody performs.
    --
    -- NULL for the review's own state, deliberately: a review that was taken
    -- down is refused a few lines below with its own message, because "this has
    -- not happened yet" and "what you wrote was removed" are different things to
    -- be told and the customer deserves to know which.
    IF NOT app_may_review(v_status, v_ends_at, NULL) THEN
        RAISE EXCEPTION 'nothing to review yet' USING ERRCODE = 'Z0011';
    END IF;

    INSERT INTO provider_reviews (id, provider_id, appointment_id, rating,
                                  comment, service_name, visited_month)
    VALUES (gen_random_uuid(), v_provider, v_appointment, p_rating,
            nullif(btrim(p_comment), ''), v_service, v_month)
    -- Amending is allowed, and the reason is that a public typo the author
    -- cannot fix is worse than the branch it costs. Replacing rather than
    -- appending: this is the same person on the same visit, not a second
    -- opinion.
    ON CONFLICT (appointment_id) DO UPDATE
       SET rating     = EXCLUDED.rating,
           comment    = EXCLUDED.comment,
           updated_at = now()
     -- A hidden review is terminal. Without this predicate, amending would be
     -- the way back out of moderation: post, get taken down, post again.
     WHERE provider_reviews.status = 'VISIBLE'
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'this review was taken down' USING ERRCODE = 'Z0012';
    END IF;

    RETURN v_id;
END $$;

ALTER FUNCTION app_submit_review(varchar, smallint, varchar)
    OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_submit_review(varchar, smallint, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_submit_review(varchar, smallint, varchar) TO balaaca_app;
