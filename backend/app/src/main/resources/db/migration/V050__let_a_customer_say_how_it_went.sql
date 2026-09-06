-- The other half of a directory.
--
-- A hub that lists businesses and carries no opinion of them is a telephone
-- book. The whole reason a customer opens this rather than asking a cousin is
-- that somebody who went before them wrote down what happened, and until now
-- the answer to "is this salon any good?" was the salon's own description of
-- itself. `professionnels/page.tsx` even said so out loud - "Aucune note, aucun
-- avis client" - which was honest while it was true and is a promise to break
-- the moment this ships.
--
--
-- Why a review needs a booking reference, exactly like a report
--
-- V037 argued this for reports and the argument is unchanged, only louder: this
-- is a market where a salon's competitor is three streets away and knows the
-- handle. An open review form on a public page is a button that competitor can
-- press from a script all night, and a five-star form is a button the salon
-- itself can press.
--
-- The booking reference is the capability the customer already holds. It was
-- minted for one appointment, it is the same handle they use to reschedule or
-- cancel, and requiring it means a review comes from somebody who actually
-- booked - which is the single property that makes the star worth reading.
--
-- What it does NOT cover, stated rather than pretended: a customer who found a
-- business here and then booked over WhatsApp has no reference and cannot
-- review. That is real. The answer is to make booking here worth doing, not to
-- open a door this closes.
--
--
-- Reviewable when it is OVER, not when it is marked COMPLETED
--
-- The tempting rule is `status = 'COMPLETED'`, and it would have made the
-- feature unreachable. Completion is a button the provider presses, and a busy
-- salon in Conakry does not press buttons after a customer leaves - so the
-- reviews would have been gated behind an action nobody performs. That is 4.8's
-- defect with the arrow reversed: not a column with no reader, a reader with no
-- writer.
--
-- So: the appointment has ENDED, and it was not cancelled and not a no-show.
-- Both of those are states in which the customer was not served and has nothing
-- to say about the service. PENDING and CONFIRMED after the fact both count,
-- because a provider who never confirmed still did the work.
--
--
-- Why the row freezes the service and the MONTH
--
-- A published review has to say what it is about, and the obvious way is to
-- join `appointments` on read. That would mean granting the public read of
-- appointments, which is the one table this schema most carefully keeps
-- private. So the row carries its own copy, minted inside the function that
-- already resolved the appointment - a snapshot, never a pointer, for the same
-- reason a notification row is one.
--
-- The month rather than the date, and this is not squeamishness. The public
-- availability endpoint publishes bookable slots; a gap in them is an
-- appointment. A review dated the 3rd of September at a salon with one chair,
-- laid over that day's gaps, names one person to anybody who cares to look.
-- Truncating on READ would not help - the column would still hold the date and
-- one SELECT would still leak it. Month granularity costs a reader nothing
-- worth having and closes the correlation for good.
--
-- The reviewer is not named at all, in any form. A first name plus a service
-- plus a small neighbourhood is an identity here.

CREATE TABLE provider_reviews (
    id             uuid         PRIMARY KEY,
    provider_id    uuid         NOT NULL,
    appointment_id uuid         NOT NULL,
    -- smallint, and the CHECK is the schema's own statement of what a star is.
    -- An application that validated this alone would be one data fix away from
    -- a seven-star review nobody can render.
    rating         smallint     NOT NULL,
    comment        varchar(1000),
    -- The service as it was called on the day, and the month it happened in the
    -- PROVIDER's timezone - which is the only timezone in which "September" is
    -- a fact about the appointment rather than about the reader.
    service_name   varchar(120) NOT NULL,
    visited_month  date         NOT NULL,
    -- VISIBLE until somebody with the lever takes it down. Two states, because
    -- V035 already taught this schema what a third state nobody moves costs.
    status         varchar(16)  NOT NULL DEFAULT 'VISIBLE',
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),
    hidden_at      timestamptz,

    CONSTRAINT ck_provider_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT ck_provider_reviews_status CHECK (status IN ('VISIBLE', 'HIDDEN')),
    CONSTRAINT ck_provider_reviews_hidden_pair
        CHECK ((status = 'HIDDEN') = (hidden_at IS NOT NULL)),
    -- An empty comment is not a comment. NULL says "stars only", which is a
    -- real thing a customer means; a string of spaces says the same thing while
    -- rendering as an empty quotation mark on the page.
    CONSTRAINT ck_provider_reviews_comment_meaningful
        CHECK (comment IS NULL OR btrim(comment) <> ''),
    -- The first of its month, so nothing downstream has to remember to truncate
    -- and no row can carry a day this table promised not to keep.
    CONSTRAINT ck_provider_reviews_month
        CHECK (visited_month = date_trunc('month', visited_month)::date),

    -- Composite, so a review can never be filed against one provider naming
    -- another's appointment.
    CONSTRAINT fk_provider_reviews_appointment
        FOREIGN KEY (provider_id, appointment_id)
        REFERENCES appointments (provider_id, id),

    -- One review per appointment. Not per customer and not per provider: a
    -- customer who comes back every month has something new to say each time,
    -- and a customer who came once does not get to say it twice.
    CONSTRAINT uq_provider_reviews_appointment UNIQUE (appointment_id),

    -- The target of review_photos' composite foreign key. Declared HERE and not
    -- in the migration that needs it: a composite reference whose target gained
    -- its UNIQUE later fails on a fresh database with 42830.
    CONSTRAINT uq_provider_reviews_tenant UNIQUE (provider_id, id)
);

-- What every public read of this table does: one provider's visible reviews,
-- newest first. The cursor pages on the same pair the order is taken on.
CREATE INDEX ix_provider_reviews_visible
    ON provider_reviews (provider_id, created_at DESC, id DESC)
    WHERE status = 'VISIBLE';

-- The moderator's queue: everything, newest first, across every provider.
CREATE INDEX ix_provider_reviews_recent ON provider_reviews (created_at DESC, id DESC);

ALTER TABLE provider_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_reviews FORCE  ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Who may see a review, and who may write one.
-- ---------------------------------------------------------------------------
--
-- A provider READS its own reviews - including the hidden ones, because a
-- business that cannot see what was said about it cannot answer the customer or
-- ask for a takedown. It writes NOTHING here: no INSERT, no UPDATE, no DELETE
-- policy names the tenant, so a salon cannot post its own five stars, cannot
-- edit a three into a five, and cannot delete a one. That asymmetry is the
-- whole trustworthiness of the feature and it is enforced by the absence of a
-- policy rather than by an application that remembers.
--
-- This policy also serves the CUSTOMER, without a line of its own: a booking
-- reference binds the provider as the tenant (4.6), so the person who left the
-- review reads it back through exactly the same rule.
--
-- Which means it admits MORE than that customer's own row, and that is worth
-- stating rather than leaving to be discovered. Binding a booking binds the
-- whole provider - it always has, on every customer route - so what confines a
-- customer to their own booking is the PREDICATE the query carries, exactly as
-- it does on the route next door that reads the appointment itself. The review
-- read runs from the appointment outwards, `WHERE a.public_reference =
-- :reference`, and a future query here that does not is how this becomes a
-- leak. No policy could tell the two connections apart: they bind one tenant.
CREATE POLICY provider_reviews_tenant_read ON provider_reviews
    FOR SELECT
    USING (provider_id = app_current_provider());

-- The public read, and it is the ONLY definition of "published review" in the
-- system. Nothing downstream restates it: the directory's average, the
-- provider page's list and the count under the stars are all one aggregate over
-- whatever this policy admits, so a hidden review stops being counted the
-- instant it is hidden, in every place at once.
CREATE POLICY provider_reviews_public_read ON provider_reviews
    FOR SELECT
    USING (app_current_provider() IS NULL
           AND status = 'VISIBLE'
           AND provider_id IN (SELECT id FROM providers
                                WHERE published AND status = 'ACTIVE'));

CREATE POLICY provider_reviews_moderation ON provider_reviews
    FOR ALL TO balaaca_moderator
    USING (true) WITH CHECK (true);

CREATE POLICY provider_reviews_maintenance ON provider_reviews
    FOR ALL TO balaaca_migrator
    USING (true) WITH CHECK (true);

GRANT SELECT ON provider_reviews TO balaaca_app;
GRANT SELECT, INSERT, UPDATE ON provider_reviews TO balaaca_moderator;

-- ---------------------------------------------------------------------------
-- The photographs.
-- ---------------------------------------------------------------------------
--
-- Three, and the number is a promise about the page rather than about storage.
-- A provider page carries its own catalogue photographs already; twenty
-- customer pictures under them is a page that never finishes loading on a
-- mid-range telephone over 3G, which is the machine this product is for.
--
-- Every file goes through the same sanitiser the rest of the platform uses,
-- which re-encodes and drops the metadata a telephone writes - including where
-- the photograph was taken. That matters more here than anywhere else in the
-- product: these are pictures taken by customers, often of themselves, and
-- their coordinates are a home address.

CREATE TABLE review_photos (
    id          uuid         PRIMARY KEY,
    provider_id uuid         NOT NULL,
    review_id   uuid         NOT NULL,
    -- The name the image store minted, exactly like providers.logo_url. It
    -- discloses nothing - not the provider, not the customer, not the original
    -- filename, which is a value the platform would have to distrust and would
    -- gain nothing from trusting.
    stored_name varchar(120) NOT NULL,
    sort_order  int          NOT NULL,
    created_at  timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT ck_review_photos_sort CHECK (sort_order >= 0 AND sort_order < 3),

    CONSTRAINT fk_review_photos_review
        FOREIGN KEY (provider_id, review_id)
        REFERENCES provider_reviews (provider_id, id) ON DELETE CASCADE,

    -- The cap, as an index rather than as a count in Java. Three slots, and two
    -- uploads cannot hold the same one: a fourth has nowhere to go and is
    -- refused by the index rather than by a check that raced.
    CONSTRAINT uq_review_photos_slot UNIQUE (review_id, sort_order),
    CONSTRAINT uq_review_photos_name UNIQUE (stored_name)
);

CREATE INDEX ix_review_photos_by_review ON review_photos (review_id, sort_order);

ALTER TABLE review_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_photos FORCE  ROW LEVEL SECURITY;

CREATE POLICY review_photos_tenant_read ON review_photos
    FOR SELECT
    USING (provider_id = app_current_provider());

-- Visible with the review it belongs to and never on its own: the predicate
-- reads provider_reviews, which is subject to its own policy, so a photograph
-- on a hidden review is unreachable for the same reason the review is - one
-- rule, stated once.
CREATE POLICY review_photos_public_read ON review_photos
    FOR SELECT
    USING (app_current_provider() IS NULL
           AND review_id IN (SELECT id FROM provider_reviews));

CREATE POLICY review_photos_moderation ON review_photos
    FOR ALL TO balaaca_moderator
    USING (true) WITH CHECK (true);

CREATE POLICY review_photos_maintenance ON review_photos
    FOR ALL TO balaaca_migrator
    USING (true) WITH CHECK (true);

GRANT SELECT ON review_photos TO balaaca_app;
GRANT SELECT, INSERT, DELETE ON review_photos TO balaaca_moderator;

-- ---------------------------------------------------------------------------
-- Writing a review: through a function, for the reason reporting is.
-- ---------------------------------------------------------------------------
--
-- The customer's connection has no tenant bound on this path and the row
-- belongs to a provider that is not theirs. More importantly the reference is
-- resolved INSIDE, so the reference and the appointment cannot disagree: there
-- is no argument a caller could pass that would file a review against an
-- appointment their reference does not name.
--
-- That is not a theoretical distinction. The alternative shape - bind the
-- tenant from the reference, then INSERT under a policy - would let a customer
-- holding one valid reference write a review against any other appointment of
-- the same provider, and the only thing standing in the way would be an
-- application check somebody has to remember.


-- The one definition of "this visit can be reviewed", named once because two
-- things ask it: the function that accepts a review, and the query that tells a
-- customer's page whether to draw the form. Written out twice, the page would
-- eventually offer a form the write path refuses - which is 4.8's defect in its
-- most irritating form, a button that answers 409.
CREATE FUNCTION app_may_review(p_appointment_status varchar, p_ends_at timestamptz,
                               p_review_status varchar)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT p_appointment_status NOT IN ('CANCELLED', 'NO_SHOW')
       AND p_ends_at <= now()
       -- A review an operator took down is terminal, so there is nothing left
       -- to offer. NULL means no review yet, which is the usual case.
       AND (p_review_status IS NULL OR p_review_status = 'VISIBLE')
$$;

REVOKE ALL ON FUNCTION app_may_review(varchar, timestamptz, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_may_review(varchar, timestamptz, varchar)
    TO balaaca_app, balaaca_moderator;

GRANT CREATE ON SCHEMA public TO balaaca_moderator;

CREATE FUNCTION app_submit_review(p_reference varchar, p_rating smallint,
                                  p_comment varchar)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_provider uuid; v_appointment uuid; v_service varchar; v_month date;
    v_status varchar; v_ends_at timestamptz; v_id uuid;
BEGIN
    SELECT a.provider_id, a.id, a.service_name, a.status, a.ends_at,
           -- The provider's own timezone. In any other one, "September" is a
           -- fact about the reader rather than about the appointment.
           date_trunc('month', a.starts_at AT TIME ZONE p.timezone)::date
      INTO v_provider, v_appointment, v_service, v_status, v_ends_at, v_month
      FROM appointments a
      JOIN providers p ON p.id = a.provider_id
     WHERE a.public_reference = p_reference;

    IF v_appointment IS NULL THEN
        RAISE EXCEPTION 'no such booking' USING ERRCODE = 'Z0005';
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

CREATE FUNCTION app_add_review_photo(p_reference varchar, p_name varchar)
RETURNS TABLE (o_id uuid, o_sort int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_review uuid; v_provider uuid;
BEGIN
    SELECT r.id, r.provider_id INTO v_review, v_provider
      FROM provider_reviews r
      JOIN appointments a ON a.id = r.appointment_id
     WHERE a.public_reference = p_reference AND r.status = 'VISIBLE';

    -- No booking, no review yet, and a review that was taken down are one
    -- answer on purpose. Each of them means "there is nothing here to attach a
    -- photograph to", and telling them apart would tell a caller holding a
    -- guessed reference which guess was closer.
    IF v_review IS NULL THEN
        RAISE EXCEPTION 'nothing to illustrate' USING ERRCODE = 'Z0005';
    END IF;

    -- The slot is chosen by the statement, not by a count read first: two
    -- uploads racing would both read two and both write slot two, and the
    -- unique index would refuse one of them. generate_series finds the lowest
    -- free slot inside the statement that takes it, so the loser gets the next
    -- one instead of an error. No row at all means all three are taken.
    RETURN QUERY
    INSERT INTO review_photos (id, provider_id, review_id, stored_name, sort_order)
    SELECT gen_random_uuid(), v_provider, v_review, p_name, slot
      FROM generate_series(0, 2) AS slot
     WHERE NOT EXISTS (SELECT 1 FROM review_photos
                        WHERE review_id = v_review AND sort_order = slot)
     ORDER BY slot
     LIMIT 1
    RETURNING id, sort_order;
END $$;

ALTER FUNCTION app_add_review_photo(varchar, varchar) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_add_review_photo(varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_add_review_photo(varchar, varchar) TO balaaca_app;

CREATE FUNCTION app_remove_review_photo(p_reference varchar, p_photo uuid)
RETURNS varchar
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name varchar;
BEGIN
    -- The reference is in the predicate, not merely resolved beforehand: this
    -- deletes a photograph only if it hangs off the review that this reference's
    -- own appointment produced.
    DELETE FROM review_photos ph
     USING provider_reviews r, appointments a
     WHERE ph.id = p_photo
       AND r.id = ph.review_id
       AND a.id = r.appointment_id
       AND a.public_reference = p_reference
    RETURNING ph.stored_name INTO v_name;

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'no such photograph' USING ERRCODE = 'Z0005';
    END IF;

    -- The freed slot is deliberately not backfilled, for the reason
    -- service_photos does not backfill: renumbering moves every other
    -- photograph, and the first one is the one a list shows.
    RETURN v_name;
END $$;

ALTER FUNCTION app_remove_review_photo(varchar, uuid) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_remove_review_photo(varchar, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_remove_review_photo(varchar, uuid) TO balaaca_app;

-- ---------------------------------------------------------------------------
-- The lever, and only the lever.
-- ---------------------------------------------------------------------------
--
-- There is no queue of reported reviews here, and that is the same decision
-- this project took about businesses: no vetting at the door, a sanction that
-- exists before launch, and the back-office that routes complaints to it after
-- there are complaints. What must exist on day one is the ability to take down
-- a photograph or a sentence that should never have been published, because the
-- alternative to that button is a database session.
--
-- Hiding is reversible, and the pair of functions is one function with a
-- boolean for that reason: an operator who took down the wrong review must be
-- able to put it back without anybody writing SQL.

CREATE FUNCTION app_set_review_visibility(p_id uuid, p_hidden boolean)
RETURNS TABLE (o_id uuid, o_slug varchar, o_business_name varchar,
               o_rating smallint, o_comment varchar, o_service_name varchar,
               o_visited_month date, o_status varchar,
               o_created_at timestamptz, o_hidden_at timestamptz,
               o_photos int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE provider_reviews
       SET status    = CASE WHEN p_hidden THEN 'HIDDEN' ELSE 'VISIBLE' END,
           -- Conditional on the current state, so asking twice does not rewrite
           -- when the operator actually acted.
           hidden_at = CASE WHEN p_hidden THEN coalesce(hidden_at, now()) END
     WHERE id = p_id
       AND status <> CASE WHEN p_hidden THEN 'HIDDEN' ELSE 'VISIBLE' END;

    RETURN QUERY
    SELECT r.id, p.slug, p.business_name, r.rating, r.comment, r.service_name,
           r.visited_month, r.status, r.created_at, r.hidden_at,
           (SELECT count(*)::int FROM review_photos ph WHERE ph.review_id = r.id)
      FROM provider_reviews r
      JOIN providers p ON p.id = r.provider_id
     WHERE r.id = p_id;

    -- Already in the state asked for is not an error: the operator wanted the
    -- review that way and it is that way. Only an unknown id is a refusal.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such review' USING ERRCODE = 'Z0007';
    END IF;
END $$;

CREATE FUNCTION app_list_reviews(p_status varchar, p_after uuid, p_limit int)
RETURNS TABLE (o_id uuid, o_slug varchar, o_business_name varchar,
               o_rating smallint, o_comment varchar, o_service_name varchar,
               o_visited_month date, o_status varchar,
               o_created_at timestamptz, o_hidden_at timestamptz,
               o_photos int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Newest first: unlike a report queue, nothing here is owed an answer, so
    -- the useful ordering is "what has just been published about a business on
    -- this hub". The cursor compares the same pair the order is taken on, so a
    -- page boundary lands in the same place twice - created_at alone would not
    -- survive two reviews in one second.
    RETURN QUERY
    SELECT r.id, p.slug, p.business_name, r.rating, r.comment, r.service_name,
           r.visited_month, r.status, r.created_at, r.hidden_at,
           (SELECT count(*)::int FROM review_photos ph WHERE ph.review_id = r.id)
      FROM provider_reviews r
      JOIN providers p ON p.id = r.provider_id
     WHERE (p_status IS NULL OR r.status = p_status)
       AND (p_after IS NULL
            OR (r.created_at, r.id)
               < (SELECT created_at, id FROM provider_reviews WHERE id = p_after))
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT p_limit;
END $$;

ALTER FUNCTION app_set_review_visibility(uuid, boolean) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_set_review_visibility(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_set_review_visibility(uuid, boolean) TO balaaca_app;

ALTER FUNCTION app_list_reviews(varchar, uuid, int) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_list_reviews(varchar, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_list_reviews(varchar, uuid, int) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_moderator;
