-- The third of the triptych.
--
-- Moderation needs three things and had two. V036 gave the platform a trace -
-- who decided what, when and why, surviving a reinstatement - and it gave the
-- decision a way back. What it did not give the business is a way to answer.
--
-- A suspended provider today reads the reason on their own dashboard and can do
-- nothing with it. The screen built for this says so at the top of its file and
-- hands over an electronic mail address, which is honest and is not a product:
-- a message sent that way reaches an inbox nobody has agreed to watch, carries
-- no link to the decision it is about, and leaves no record that the platform
-- was told anything.
--
-- That asymmetry is what separates a platform from an arbitrary one. It is also
-- what the European Digital Services Act requires of a marketplace, which is
-- not this market yet and is a reason to build the habit rather than to wait.
--
--
-- Why a contestation names the suspension it is about
--
-- A business can be suspended, contest, be reinstated, and be suspended again
-- months later for something unrelated. Without `about_suspension_at` the
-- operator opens a queue of messages that all say "this is unfair" with no way
-- to tell which decision each one answers.
--
-- It is a snapshot, taken at submission, exactly like the recipient frozen onto
-- a notification row: the provider's own suspended_at is cleared the moment
-- they are reinstated, so a foreign key to a living value would erase the
-- context of every message the day it did its job.

CREATE TABLE provider_contestations (
    id                  uuid        PRIMARY KEY,
    provider_id         uuid        NOT NULL,
    message             varchar(2000) NOT NULL,
    -- Which suspension this answers. NOT a foreign key: there is no suspension
    -- table, and there should not be one - the standing lives on the provider
    -- and the history lives in audit_logs, which is append-only and is the
    -- record. This is the join key a human uses to find that row.
    about_suspension_at timestamptz NOT NULL,
    -- Two states and no workflow, for the reason provider_reports has two: a
    -- queue with five statuses nobody moves is providers.status made again.
    status              varchar(16) NOT NULL DEFAULT 'PENDING',
    submitted_at        timestamptz NOT NULL DEFAULT now(),
    read_at             timestamptz,

    CONSTRAINT ck_provider_contestations_status
        CHECK (status IN ('PENDING', 'READ')),
    CONSTRAINT ck_provider_contestations_read_pair
        CHECK ((status = 'READ') = (read_at IS NOT NULL)),
    CONSTRAINT ck_provider_contestations_message
        CHECK (btrim(message) <> ''),
    CONSTRAINT fk_provider_contestations_provider
        FOREIGN KEY (provider_id) REFERENCES providers (id),

    -- One message per suspension. A provider who presses twice meant it once,
    -- and without this a single upset business is an inbox. They can still say
    -- more by being suspended again, which is the only situation where a second
    -- message is about something new.
    CONSTRAINT uq_provider_contestations_episode
        UNIQUE (provider_id, about_suspension_at)
);

CREATE INDEX ix_provider_contestations_pending ON provider_contestations (submitted_at)
    WHERE status = 'PENDING';

ALTER TABLE provider_contestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_contestations FORCE  ROW LEVEL SECURITY;

-- Unlike provider_reports, the author MAY read their own. A report is about a
-- provider and showing it to them would be an invitation to reprisal; a
-- contestation is BY them, and a business that cannot see whether its own
-- message arrived has no more than the electronic mail address it replaced.
CREATE POLICY provider_contestations_tenant ON provider_contestations
    FOR ALL
    USING      (provider_id = app_current_provider())
    WITH CHECK (provider_id = app_current_provider());

CREATE POLICY provider_contestations_moderation ON provider_contestations
    FOR ALL TO balaaca_moderator
    USING (true) WITH CHECK (true);

CREATE POLICY provider_contestations_maintenance ON provider_contestations
    FOR ALL TO balaaca_migrator
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON provider_contestations TO balaaca_app;
GRANT SELECT, UPDATE ON provider_contestations TO balaaca_moderator;

-- ---------------------------------------------------------------------------
-- Filing one, and reading the queue.
-- ---------------------------------------------------------------------------
--
-- Filing is an ordinary tenant-scoped INSERT and needs no function: the
-- business is writing its own row, which is exactly what the tenant policy
-- admits. Reading the queue does need one, for the reason every moderation read
-- does - balaaca_app cannot see another provider's row, and the operator has no
-- provider at all.

GRANT CREATE ON SCHEMA public TO balaaca_moderator;

CREATE FUNCTION app_list_contestations(p_status varchar, p_after uuid, p_limit int)
RETURNS TABLE (o_id uuid, o_slug varchar, o_business_name varchar,
               o_provider_status varchar, o_message varchar,
               o_about_suspension_at timestamptz, o_status varchar,
               o_submitted_at timestamptz, o_read_at timestamptz,
               o_current_reason varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Pending first, oldest first: a business waiting on an answer has been
    -- waiting since it was suspended, and the longest wait leads.
    --
    -- current_reason is the reason the provider carries NOW, which is NULL once
    -- they have been reinstated. That is the useful thing to show beside a
    -- message: it tells the operator at a glance whether this contestation is
    -- still about a live decision or about one already undone.
    RETURN QUERY
    SELECT c.id, p.slug, p.business_name, p.status, c.message,
           c.about_suspension_at, c.status, c.submitted_at, c.read_at,
           p.suspension_reason
      FROM provider_contestations c
      JOIN providers p ON p.id = c.provider_id
     WHERE (p_status IS NULL OR c.status = p_status)
       AND (p_after IS NULL
            OR ((c.status = 'READ'), c.submitted_at, c.id)
               > (SELECT (status = 'READ'), submitted_at, id
                    FROM provider_contestations WHERE id = p_after))
     ORDER BY (c.status = 'READ'), c.submitted_at, c.id
     LIMIT p_limit;
END $$;

CREATE FUNCTION app_read_contestation(p_id uuid)
RETURNS TABLE (o_id uuid, o_slug varchar, o_business_name varchar,
               o_provider_status varchar, o_message varchar,
               o_about_suspension_at timestamptz, o_status varchar,
               o_submitted_at timestamptz, o_read_at timestamptz,
               o_current_reason varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Conditional, so reading twice does not move read_at and rewrite when the
    -- operator actually looked.
    UPDATE provider_contestations
       SET status = 'READ', read_at = now()
     WHERE id = p_id AND status = 'PENDING';

    RETURN QUERY
    SELECT c.id, p.slug, p.business_name, p.status, c.message,
           c.about_suspension_at, c.status, c.submitted_at, c.read_at,
           p.suspension_reason
      FROM provider_contestations c
      JOIN providers p ON p.id = c.provider_id
     WHERE c.id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such contestation' USING ERRCODE = 'Z0010';
    END IF;
END $$;

ALTER FUNCTION app_list_contestations(varchar, uuid, int) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_list_contestations(varchar, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_list_contestations(varchar, uuid, int) TO balaaca_app;

ALTER FUNCTION app_read_contestation(uuid) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_read_contestation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_read_contestation(uuid) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_moderator;
