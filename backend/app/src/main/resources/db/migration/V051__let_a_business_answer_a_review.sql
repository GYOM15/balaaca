-- The other side of an opinion.
--
-- V050 gave a customer the right to say what happened and gave the business no
-- way to answer it. That asymmetry is defensible for a week and not for a year:
-- in this market a one-line reply is often the whole truth of a bad review -
-- "la cliente n'est pas venue, le rendez-vous a ete note comme honore par
-- erreur" - and a hub that publishes the accusation and refuses the answer is
-- not neutral, it is just quieter about which side it takes.
--
-- It was deliberately not in V050, and the reason stands: a reply is a second
-- piece of public text with its own moderation surface, and the takedown lever
-- had to exist before any of it did.
--
--
-- The one write a business may make on this table, and how it is confined
--
-- V050's whole trustworthiness is that a provider has no write on
-- provider_reviews at all - no policy names the tenant, so a salon cannot post
-- its own five stars, cannot turn a one into a five, and cannot delete what it
-- dislikes. Adding a reply means adding a write, and the question is what stops
-- that write touching the rating.
--
-- Not a policy: an RLS policy admits ROWS and says nothing about columns. What
-- says it is a COLUMN privilege - `GRANT UPDATE (reply, replied_at)` and
-- nothing else - so `UPDATE provider_reviews SET rating = 5` is refused by
-- PostgreSQL before any policy is consulted, with `permission denied for column
-- rating`. The two mechanisms answer different questions and both are needed:
-- the grant decides what may be written, the policy decides where.
--
-- VISIBLE only. A review an operator took down is inert, and a reply attached
-- to one would be a business writing into a page nobody reads.

ALTER TABLE provider_reviews
    ADD COLUMN reply       varchar(1000),
    ADD COLUMN replied_at  timestamptz;

ALTER TABLE provider_reviews
    -- Both or neither, so a reply always carries when it was written and a
    -- withdrawn one leaves no timestamp behind pointing at nothing.
    ADD CONSTRAINT ck_provider_reviews_reply_pair
        CHECK ((reply IS NULL) = (replied_at IS NULL)),
    -- An empty reply is not a reply. NULL says "nothing said", which is the
    -- usual state; a string of spaces says the same thing while rendering as an
    -- empty quotation mark under somebody's complaint.
    ADD CONSTRAINT ck_provider_reviews_reply_meaningful
        CHECK (reply IS NULL OR btrim(reply) <> '');

-- Where. The tenant's own rows, and it may not move one to another provider.
CREATE POLICY provider_reviews_tenant_reply ON provider_reviews
    FOR UPDATE
    USING      (provider_id = app_current_provider() AND status = 'VISIBLE')
    WITH CHECK (provider_id = app_current_provider() AND status = 'VISIBLE');

-- What. Two columns and no others - this is the line that keeps a business out
-- of its own rating, and it is a GRANT rather than a rule because a rule cannot
-- express it.
GRANT UPDATE (reply, replied_at) ON provider_reviews TO balaaca_app;

-- ---------------------------------------------------------------------------
-- The operator needs a lever that reaches the reply alone.
-- ---------------------------------------------------------------------------
--
-- Hiding the review was the only lever there was, and it is the wrong one here:
-- a business that answers a fair complaint with an insult would be dealt with
-- by removing the CUSTOMER's words too. That punishes the person who was
-- wronged in order to reach the person who wronged them.
--
-- So: clear the reply, leave the review standing. A function for the same
-- reason every other moderation statement is one - balaaca_app cannot reach
-- another provider's row, and the moderator is the only role that can.

GRANT CREATE ON SCHEMA public TO balaaca_moderator;

CREATE FUNCTION app_clear_review_reply(p_id uuid)
RETURNS TABLE (o_id uuid, o_slug varchar, o_business_name varchar,
               o_rating smallint, o_comment varchar, o_service_name varchar,
               o_visited_month date, o_status varchar,
               o_created_at timestamptz, o_hidden_at timestamptz,
               o_photos int, o_reply varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Conditional on there being one, so clearing twice does not pretend to
    -- have done something the second time.
    UPDATE provider_reviews
       SET reply = NULL, replied_at = NULL
     WHERE id = p_id AND reply IS NOT NULL;

    RETURN QUERY
    SELECT r.id, p.slug, p.business_name, r.rating, r.comment, r.service_name,
           r.visited_month, r.status, r.created_at, r.hidden_at,
           (SELECT count(*)::int FROM review_photos ph WHERE ph.review_id = r.id),
           r.reply
      FROM provider_reviews r
      JOIN providers p ON p.id = r.provider_id
     WHERE r.id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such review' USING ERRCODE = 'Z0007';
    END IF;
END $$;

ALTER FUNCTION app_clear_review_reply(uuid) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_clear_review_reply(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_clear_review_reply(uuid) TO balaaca_app;

-- The two moderation reads carry the reply too: an operator deciding whether to
-- clear one has to be able to see it. Replaced rather than altered, because a
-- function's return type cannot be widened in place.
DROP FUNCTION app_list_reviews(varchar, uuid, int);
DROP FUNCTION app_set_review_visibility(uuid, boolean);

CREATE FUNCTION app_list_reviews(p_status varchar, p_after uuid, p_limit int)
RETURNS TABLE (o_id uuid, o_slug varchar, o_business_name varchar,
               o_rating smallint, o_comment varchar, o_service_name varchar,
               o_visited_month date, o_status varchar,
               o_created_at timestamptz, o_hidden_at timestamptz,
               o_photos int, o_reply varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT r.id, p.slug, p.business_name, r.rating, r.comment, r.service_name,
           r.visited_month, r.status, r.created_at, r.hidden_at,
           (SELECT count(*)::int FROM review_photos ph WHERE ph.review_id = r.id),
           r.reply
      FROM provider_reviews r
      JOIN providers p ON p.id = r.provider_id
     WHERE (p_status IS NULL OR r.status = p_status)
       AND (p_after IS NULL
            OR (r.created_at, r.id)
               < (SELECT created_at, id FROM provider_reviews WHERE id = p_after))
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT p_limit;
END $$;

CREATE FUNCTION app_set_review_visibility(p_id uuid, p_hidden boolean)
RETURNS TABLE (o_id uuid, o_slug varchar, o_business_name varchar,
               o_rating smallint, o_comment varchar, o_service_name varchar,
               o_visited_month date, o_status varchar,
               o_created_at timestamptz, o_hidden_at timestamptz,
               o_photos int, o_reply varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE provider_reviews
       SET status    = CASE WHEN p_hidden THEN 'HIDDEN' ELSE 'VISIBLE' END,
           hidden_at = CASE WHEN p_hidden THEN coalesce(hidden_at, now()) END
     WHERE id = p_id
       AND status <> CASE WHEN p_hidden THEN 'HIDDEN' ELSE 'VISIBLE' END;

    RETURN QUERY
    SELECT r.id, p.slug, p.business_name, r.rating, r.comment, r.service_name,
           r.visited_month, r.status, r.created_at, r.hidden_at,
           (SELECT count(*)::int FROM review_photos ph WHERE ph.review_id = r.id),
           r.reply
      FROM provider_reviews r
      JOIN providers p ON p.id = r.provider_id
     WHERE r.id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such review' USING ERRCODE = 'Z0007';
    END IF;
END $$;

ALTER FUNCTION app_list_reviews(varchar, uuid, int) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_list_reviews(varchar, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_list_reviews(varchar, uuid, int) TO balaaca_app;

ALTER FUNCTION app_set_review_visibility(uuid, boolean) OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION app_set_review_visibility(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_set_review_visibility(uuid, boolean) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_moderator;
