-- Count the complaints against a business, on the list the operator decides
-- from.
--
-- The appointment count from V048 answers what a suspension COSTS: forty
-- bookings is forty customers still expected at the door on Thursday, because
-- suspending does not cancel one of them. Nothing on that list answers the
-- other half - whether there is a case at all. The reports are already in the
-- inbox, one row per complaint, and matching them to a name meant reading the
-- inbox and the list side by side and counting by eye.
--
-- Pending only, and that is the whole point of the number. A report an operator
-- has already looked at and closed is a decision he made; counting it again on
-- the list would make a business he cleared last month look exactly like one
-- nobody has read yet, and the count would only ever go up.
--
-- The return type gains a column, so this is a DROP and a CREATE: a function
-- cannot be replaced with one that returns a different shape.
--
-- Ownership can only be handed to a role that may create in the schema, so the
-- grant is opened for the length of this migration and closed again at the
-- bottom, exactly as V036, V037, V041 and V048 do.
GRANT CREATE ON SCHEMA public TO balaaca_moderator;

DROP FUNCTION app_list_all_providers(varchar, varchar, varchar, varchar, int);

CREATE FUNCTION app_list_all_providers(p_search varchar, p_status varchar,
                                       p_after_name varchar, p_after_slug varchar,
                                       p_limit int)
RETURNS TABLE (o_slug varchar, o_business_name varchar, o_trade varchar,
               o_locality_slug varchar, o_locality_label varchar, o_area varchar,
               o_published boolean, o_status varchar, o_registered_at timestamptz,
               o_appointment_count bigint, o_report_count bigint,
               o_suspension_reason varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Unchanged from V048 but for the one column: alphabetical always, because
    -- a cursor over an ordered sequence is only meaningful while the order
    -- holds still; and the tiebreaker is the SLUG and never the row id, which
    -- is what row-level security compares and which the contract never accepts
    -- back. A caller paging one entry at a time would otherwise harvest the
    -- internal identifier of every business on the platform.
    RETURN QUERY
    SELECT p.slug, p.business_name, c.label_fr, l.slug, l.label_fr, p.area,
           p.published, p.status, p.created_at,
           (SELECT count(*) FROM appointments a WHERE a.provider_id = p.id),
           -- Both counts stay counts. The moderator sees how many, never who:
           -- customers is not granted to this role, and neither the reporter
           -- nor the appointment behind a complaint appears here.
           (SELECT count(*) FROM provider_reports r
             WHERE r.provider_id = p.id AND r.status = 'PENDING'),
           p.suspension_reason
      FROM providers p
      LEFT JOIN provider_categories c ON c.id = p.category_id
      LEFT JOIN localities          l ON l.id = p.locality_id
     WHERE (p_status IS NULL OR p.status = p_status)
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
