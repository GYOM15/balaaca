-- The lever had no list.
--
-- V036 gave the platform a way to take a business off the hub, keyed on its
-- slug. V037 and V041 gave it two queues to read. Between them there was still
-- no operation answering "which businesses exist", so the operator suspended by
-- typing a handle he had no way to look up: he could act on a salon only if
-- some customer had already complained about it by name.
--
-- This is the missing read, and it is the widest one the moderator has. It
-- crosses every tenant at once, which is exactly what the role is for - so it
-- goes through the same seam as every other moderation read rather than a new
-- one: a SECURITY DEFINER function owned by balaaca_moderator, executable by
-- balaaca_app and by nothing else.
--
--
-- Why balaaca_app cannot do this itself
--
-- With no tenant bound its only SELECT policy on providers is the public one:
-- published AND status = 'ACTIVE'. That hides precisely the rows the operator
-- most needs - the suspended business he is deciding whether to put back, and
-- the unpublished one that never went live. A listing built on that connection
-- would be a directory with the moderation cases filtered out of it.
--
-- The moderator already holds providers_moderation_read (V036, USING (true))
-- and appointments_moderation (V037, SELECT, USING (true)). Nothing is widened
-- here beyond two reference tables that carry no tenant data at all.

-- The trade and the place are labels on tables the moderator has never read.
-- Neither is under row-level security - they are public reference data,
-- identical for every tenant - so a plain grant is the whole of it.
GRANT SELECT ON provider_categories, localities TO balaaca_moderator;

-- Ownership of a function can only be handed to a role that may create in the
-- schema, so the grant is opened for the length of this migration and closed
-- again at the bottom. V036, V037 and V041 all do this, for the same reason.
GRANT CREATE ON SCHEMA public TO balaaca_moderator;

-- What the operator decides from, and deliberately not one column more.
--
-- The appointment count is the reason a suspension is never a free action: a
-- salon holding forty bookings is forty customers who are still expected at the
-- door on Thursday, because suspending does NOT cancel what is already booked.
-- Seeing the number before pulling the lever is the difference between a
-- decision and a guess.
--
-- customers is still not granted, and the count keeps that line: it says how
-- many appointments a business holds, never who is in them. The moderator sees
-- volume, not people.
CREATE FUNCTION app_list_all_providers(p_search varchar, p_status varchar,
                                       p_after_name varchar, p_after_slug varchar,
                                       p_limit int)
RETURNS TABLE (o_slug varchar, o_business_name varchar, o_trade varchar,
               o_locality_slug varchar, o_locality_label varchar, o_area varchar,
               o_published boolean, o_status varchar, o_registered_at timestamptz,
               o_appointment_count bigint, o_suspension_reason varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Alphabetical, always, for the reason listProviders is: a cursor over an
    -- ordered sequence is only meaningful while the order holds still, and a
    -- relevance score moves every time any business edits its name.
    --
    -- The tiebreaker is the SLUG and never the row id, which is the rule the
    -- directory's own cursor records: the id is what row-level security
    -- compares in `id = app_current_provider()`, the contract never accepts it
    -- back, and a caller paging one entry at a time would harvest the internal
    -- identifier of every business on the platform. The slug is unique, so it
    -- orders exactly as well, and it is already printed on the QR code.
    --
    -- The pair compared here is the pair the ORDER BY sorts on. Two salons can
    -- both be called Chez Fatou, and a boundary that could not tell them apart
    -- would drop one or repeat it on every page.
    RETURN QUERY
    SELECT p.slug, p.business_name, c.label_fr, l.slug, l.label_fr, p.area,
           p.published, p.status, p.created_at,
           (SELECT count(*) FROM appointments a WHERE a.provider_id = p.id),
           p.suspension_reason
      FROM providers p
      -- Both LEFT: a business with no trade and no place is a real row and the
      -- operator needs to see it, most of all - an incomplete registration is
      -- one of the things he is looking for.
      LEFT JOIN provider_categories c ON c.id = p.category_id
      LEFT JOIN localities          l ON l.id = p.locality_id
     WHERE (p_status IS NULL OR p.status = p_status)
       -- Name or handle, because the operator arrives holding one or the other:
       -- a name from a telephone call, a slug from a link somebody sent him.
       AND (p_search IS NULL
            OR p.business_name ILIKE '%' || p_search || '%'
            OR p.slug          ILIKE '%' || p_search || '%')
       AND (p_after_slug IS NULL
            OR (p.business_name, p.slug) > (p_after_name, p_after_slug))
     ORDER BY p.business_name, p.slug
     LIMIT p_limit;
END $$;

ALTER FUNCTION app_list_all_providers(varchar, varchar, varchar, varchar, int)
    OWNER TO balaaca_moderator;
REVOKE ALL ON FUNCTION
    app_list_all_providers(varchar, varchar, varchar, varchar, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    app_list_all_providers(varchar, varchar, varchar, varchar, int) TO balaaca_app;

REVOKE CREATE ON SCHEMA public FROM balaaca_moderator;
