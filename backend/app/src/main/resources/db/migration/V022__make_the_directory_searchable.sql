-- The hub's search box could not find what a customer types.
--
-- listProviders matched `q` against providers.business_name and nothing else.
-- A customer looking for braids types "tresses", no business is literally named
-- Tresses, and the search returns nothing - on a home page whose whole purpose
-- is that box. What a salon actually calls its work lives in
-- service_offerings.name ("Tresses collees", "Defrisage"), and the trade lives
-- in provider_categories.label_fr, and neither was searched or indexed.
--
-- Two things are needed: a policy that lets an unbound connection read the
-- services of a PUBLISHED provider, and an index so the match is not a scan.

-- ---------------------------------------------------------------------------
-- Reading a published provider's services with no tenant bound
-- ---------------------------------------------------------------------------
-- service_offerings is FORCE RLS and scoped to the bound tenant, which is
-- correct everywhere else: the provider page binds its tenant from the slug
-- first, and the dashboard is bound by membership. The directory binds nothing -
-- it spans providers - so the EXISTS below would match zero rows and the search
-- would silently return only name matches.
--
-- This discloses nothing new. Exactly these rows are already published by
-- getPublicProvider, one provider at a time. What changes is that they can now
-- be MATCHED without being fetched.
--
-- Narrowed the same way providers_public_read is: only with NO tenant bound, so
-- an authenticated request never sees another provider's catalogue through it.
CREATE POLICY service_offerings_public_read ON service_offerings
    FOR SELECT
    USING (active
           AND app_current_provider() IS NULL
           AND provider_id IN (SELECT id FROM providers
                                WHERE published AND status IN ('PENDING', 'ACTIVE')));

-- ---------------------------------------------------------------------------
-- The index
-- ---------------------------------------------------------------------------
-- gin_trgm_ops serves ILIKE '%x%', which is why the equivalent index on
-- providers.business_name exists. Partial on `active`, because a retired
-- service is never searched and never returned.
CREATE INDEX ix_service_offerings_name_trgm
    ON service_offerings USING gin (name gin_trgm_ops) WHERE active;

-- Eighteen rows today, and a sequential scan on eighteen rows is free - but the
-- taxonomy is meant to grow, and an index that arrives with the query it serves
-- is one nobody has to remember later.
CREATE INDEX ix_provider_categories_label_trgm
    ON provider_categories USING gin (label_fr gin_trgm_ops) WHERE active;
