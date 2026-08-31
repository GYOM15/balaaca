-- The inbox that has to exist before a back-office is worth building.
--
-- V036 gave the platform a lever. A lever with no signal is a founder
-- refreshing pages hoping to notice fraud, so this is the other half: a way for
-- the person who was actually harmed to say so.
--
--
-- Why a report is tied to a booking reference and not to a slug
--
-- The obvious shape is "anyone can report any provider from its public page",
-- and it is wrong here for a reason that is not squeamishness about abuse in
-- general. This is a hub in a market where a salon's competitor is three
-- streets away and knows the handle. An anonymous, unauthenticated report
-- endpoint on a public slug is a button that competitor can press, from a
-- script, all night.
--
-- The booking reference is the capability the customer already holds. It is 256
-- bits from a SecureRandom, it was minted for exactly one appointment, and it
-- is the same handle they already use to reschedule or cancel. Requiring it
-- means a report comes from somebody who actually booked - and it arrives with
-- the appointment attached, so the founder reads "this booking, this date, this
-- service" instead of "someone says something".
--
-- What it does NOT cover, stated rather than pretended: a customer defrauded by
-- a business they found here but booked over WhatsApp has no reference and no
-- way to report. That is real, and the answer to it is a contact address on the
-- site rather than a second endpoint that reopens the door this one closes.

CREATE TABLE provider_reports (
    id             uuid        PRIMARY KEY,
    provider_id    uuid        NOT NULL,
    appointment_id uuid        NOT NULL,
    -- A closed set. Free text alone would make the queue unreadable at the only
    -- moment it matters - and these five are what a customer in this market
    -- actually complains about.
    reason         varchar(32) NOT NULL,
    details        varchar(1000),
    -- PENDING until the founder has looked. No workflow beyond that: three
    -- states nobody moves would be V035's mistake made again.
    status         varchar(16) NOT NULL DEFAULT 'PENDING',
    reported_at    timestamptz NOT NULL DEFAULT now(),
    reviewed_at    timestamptz,

    CONSTRAINT ck_provider_reports_reason CHECK (reason IN (
        'NO_SHOW',           -- the business did not turn up, or was closed
        'NOT_AS_DESCRIBED',  -- the service was not what the page said
        'OVERCHARGED',       -- a price other than the one quoted
        'RUDE_OR_UNSAFE',    -- behaviour, which is the one that matters most
        'OTHER')),
    CONSTRAINT ck_provider_reports_status CHECK (status IN ('PENDING', 'REVIEWED')),
    CONSTRAINT ck_provider_reports_reviewed_pair
        CHECK ((status = 'REVIEWED') = (reviewed_at IS NOT NULL)),
    CONSTRAINT ck_provider_reports_details_meaningful
        CHECK (details IS NULL OR btrim(details) <> ''),

    -- Composite, so a report can never be filed against one provider naming
    -- another's appointment.
    CONSTRAINT fk_provider_reports_appointment
        FOREIGN KEY (provider_id, appointment_id)
        REFERENCES appointments (provider_id, id),

    -- One report per appointment. A customer who presses the button twice meant
    -- it once, and without this a single upset person is an inbox.
    CONSTRAINT uq_provider_reports_appointment UNIQUE (appointment_id)
);

CREATE INDEX ix_provider_reports_pending ON provider_reports (reported_at)
    WHERE status = 'PENDING';

ALTER TABLE provider_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_reports FORCE  ROW LEVEL SECURITY;

-- No tenant policy, and that is the point: a provider must NOT be able to read
-- the reports filed against it. Being able to would tell a business exactly who
-- complained - the appointment names the customer - which in a market this
-- small is the difference between a report and a reprisal.
--
-- So the only readers are the migrator, for maintenance, and the moderator,
-- which is the role the founder's own route already goes through.
CREATE POLICY provider_reports_moderation ON provider_reports
    FOR ALL TO balaaca_moderator
    USING (true) WITH CHECK (true);

CREATE POLICY provider_reports_maintenance ON provider_reports
    FOR ALL TO balaaca_migrator
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON provider_reports TO balaaca_moderator;

-- ---------------------------------------------------------------------------
-- What the moderator may read, and what it deliberately may not.
-- ---------------------------------------------------------------------------
--
-- A report is only useful attached to the booking it is about: the date, the
-- service, and - for the filing function - the reference that proves the person
-- was a customer. So the moderator reads `appointments`, across every provider.
--
-- That is a real widening and it is bounded on purpose. It is strictly less
-- than the role already has: it can take any business off the hub, so reading
-- when an appointment was is not the sensitive half.
--
-- `customers` is NOT granted, and that is the line. The moderator sees that an
-- appointment existed, for what service, on what day - never who was in the
-- chair. A moderation queue that hands the operator every complainant's name
-- and telephone number is a marketing list with a grievance attached, and
-- nothing about deciding whether to suspend a salon needs it.
GRANT SELECT ON appointments TO balaaca_moderator;

CREATE POLICY appointments_moderation ON appointments
    FOR SELECT TO balaaca_moderator
    USING (true);

-- Filing goes through a function for the same reason moderation does: the
-- customer's connection has no tenant bound, and the row belongs to a provider
-- that is not theirs. The reference is resolved inside, so the caller never
-- learns whether a reference exists by any route other than using it.
GRANT CREATE ON SCHEMA public TO balaaca_moderator;

CREATE FUNCTION app_report_provider(p_reference varchar, p_reason varchar,
                                    p_details varchar)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider uuid; v_appointment uuid; v_id uuid;
BEGIN
    SELECT provider_id, id INTO v_provider, v_appointment
      FROM appointments WHERE public_reference = p_reference;

    IF v_appointment IS NULL THEN
        RAISE EXCEPTION 'no such booking' USING ERRCODE = 'Z0005';
    END IF;

    v_id := gen_random_uuid();
    INSERT INTO provider_reports (id, provider_id, appointment_id, reason, details)
    VALUES (v_id, v_provider, v_appointment, p_reason,
            nullif(btrim(p_details), ''))
    -- A second press of the button is the same report, not an error the
    -- customer should have to understand.
    ON CONFLICT (appointment_id) DO NOTHING;

    RETURN v_id;
END $$;

ALTER FUNCTION app_report_provider(varchar, varchar, varchar) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_report_provider(varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_report_provider(varchar, varchar, varchar) TO balaaca_app;

-- Reading the queue, and marking one seen. Functions for the same reason the
-- suspension is one: balaaca_app has no policy on provider_reports at all, and
-- the join reaches providers and appointments, which it cannot see across
-- tenants either. The moderator can see all three and can do nothing else.

CREATE FUNCTION app_list_provider_reports(p_status varchar, p_after uuid, p_limit int)
RETURNS TABLE (o_id uuid, o_slug varchar, o_business_name varchar,
               o_provider_status varchar, o_reason varchar, o_details varchar,
               o_status varchar, o_reported_at timestamptz, o_reviewed_at timestamptz,
               o_starts_at timestamptz, o_service_name varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Pending first, then oldest first within each: the longest-ignored
    -- complaint leads, which is the only ordering an inbox can defend. The
    -- cursor compares the same triple as a row, so a page boundary lands in the
    -- same place twice - id alone would not survive two reports in one second.
    RETURN QUERY
    SELECT r.id, p.slug, p.business_name, p.status, r.reason, r.details,
           r.status, r.reported_at, r.reviewed_at, a.starts_at, a.service_name
      FROM provider_reports r
      JOIN providers p ON p.id = r.provider_id
      JOIN appointments a ON a.id = r.appointment_id
     WHERE (p_status IS NULL OR r.status = p_status)
       AND (p_after IS NULL
            OR ((r.status = 'REVIEWED'), r.reported_at, r.id)
               > (SELECT (status = 'REVIEWED'), reported_at, id
                    FROM provider_reports WHERE id = p_after))
     ORDER BY (r.status = 'REVIEWED'), r.reported_at, r.id
     LIMIT p_limit;
END $$;

CREATE FUNCTION app_review_provider_report(p_id uuid)
RETURNS TABLE (o_id uuid, o_slug varchar, o_business_name varchar,
               o_provider_status varchar, o_reason varchar, o_details varchar,
               o_status varchar, o_reported_at timestamptz, o_reviewed_at timestamptz,
               o_starts_at timestamptz, o_service_name varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Conditional on the current status, so reviewing twice does not move
    -- reviewed_at and rewrite when the operator actually looked.
    UPDATE provider_reports
       SET status = 'REVIEWED', reviewed_at = now()
     WHERE id = p_id AND status = 'PENDING';

    RETURN QUERY
    SELECT r.id, p.slug, p.business_name, p.status, r.reason, r.details,
           r.status, r.reported_at, r.reviewed_at, a.starts_at, a.service_name
      FROM provider_reports r
      JOIN providers p ON p.id = r.provider_id
      JOIN appointments a ON a.id = r.appointment_id
     WHERE r.id = p_id;

    -- Already reviewed is not an error: the operator asking again wants to see
    -- the report, and it is in exactly the state they asked for. Only an
    -- unknown id is a refusal.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such report' USING ERRCODE = 'Z0007';
    END IF;
END $$;

ALTER FUNCTION app_list_provider_reports(varchar, uuid, int) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_list_provider_reports(varchar, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_list_provider_reports(varchar, uuid, int) TO balaaca_app;

ALTER FUNCTION app_review_provider_report(uuid) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_review_provider_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_review_provider_report(uuid) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_moderator;
