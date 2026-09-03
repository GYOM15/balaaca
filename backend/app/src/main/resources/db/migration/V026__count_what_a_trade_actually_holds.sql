-- A category with no provider makes the hub look deserted, and that single
-- worry is what kept seventeen trades out for a week.
--
-- It is a worry about the HOMEPAGE, not about the taxonomy: a tile with nothing
-- behind it is embarrassing, an option in a filter is not. So instead of
-- guessing which trades will fill and admitting only those, the count is
-- published and the client shows the ones that hold somebody. A trade added by
-- a migration is then invisible on the day it lands and appears by itself when
-- the first provider registers under it.
--
-- A view rather than a column: a counter column has to be maintained on every
-- publish, unpublish, suspension and category change, and the day one of those
-- forgets, the number lies. This one cannot drift because it is the query.
--
-- The predicate is exactly providers_public_read's - published, and status in
-- PENDING or ACTIVE. A count that admitted a suspended salon would advertise a
-- trade the directory then refuses to show.
CREATE VIEW provider_category_counts AS
    SELECT c.id AS category_id,
           count(p.id) FILTER (
               WHERE p.published AND p.status IN ('PENDING', 'ACTIVE')
           )::int AS provider_count
      FROM provider_categories c
      LEFT JOIN providers p ON p.category_id = c.id
     GROUP BY c.id;

-- security_invoker: the view runs with the privileges and the RLS of whoever
-- selects from it, not of the migrator who created it. Without this it would be
-- a hole straight through providers' row-level security - a caller could learn
-- how many providers exist under a trade including the ones its policy hides.
-- Here the count is of public rows only, so the answer is the same for
-- everybody, and that is a property of the predicate rather than of luck.
ALTER VIEW provider_category_counts SET (security_invoker = true);

GRANT SELECT ON provider_category_counts TO balaaca_app;
