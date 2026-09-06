-- Where else this business lives.
--
-- A salon in Conakry does not start on this platform. It starts on Facebook,
-- and the page it already has is where its customers already are. A hub that
-- refuses to point at that page is asking a business to choose, and the
-- business will not choose this one.
--
--
-- Why a table and not columns on `providers`
--
-- Eight nullable columns would sit on the row that EVERY directory query reads,
-- for a fact that only the provider's own page renders. And the argument that a
-- table costs a migration per new network cuts both ways: a column costs one
-- too, plus a contract field that can never be removed once published. The
-- table costs one CHECK value and one icon.
--
--
-- Why the row stores a HANDLE and not a URL
--
-- This is the load-bearing decision here, so it is stated rather than left in
-- the shape.
--
-- A provider-supplied URL rendered as an `href` is two vulnerabilities wearing
-- one field. The first is `javascript:` and `data:`, which is an XSS on a page
-- served to strangers. The second is quieter and does not need a scheme at all:
-- an Instagram icon whose link goes anywhere the provider likes is a cloaking
-- primitive, and the platform would be lending its own chrome to it.
--
-- Storing the handle closes both for good. `instagram.com/` is a constant in
-- this codebase and the provider contributes a path segment, so an Instagram
-- icon leads to Instagram, always, with no rule anybody has to remember. The
-- charset admits no colon, no query, no fragment, no leading slash and no `..`,
-- so the value cannot leave the path it was put in. The URL itself is composed
-- on the way out, once, and the wire carries something already safe.
--
-- The cost is honest: when a network changes its URL shape, that is a code
-- change rather than a data fix. It is a change to one map.
--
--
-- WEBSITE is the exception, and it is fenced rather than pretended away
--
-- A business's own site has no base to compose from, so that one kind holds a
-- whole URL. What confines it: the scheme must be `https`, the host must be a
-- dotted name, and no whitespace is allowed anywhere. `javascript:` cannot
-- match. What it does NOT confine is where the site goes, because that is the
-- feature. Rendering fences the rest - `rel="nofollow noopener noreferrer"` -
-- and a provider who points it somewhere it should not go is a moderation
-- matter, which this platform already has a lever for.
--
--
-- There is no WHATSAPP kind, deliberately
--
-- `providers.whatsapp_phone_e164` already holds that number and the public page
-- already draws the button. A kind here would be a second place holding one
-- fact, and this repository has paid for that class of defect enough times to
-- recognise it on sight. WhatsApp stays where it is.
--
--
-- One row per network, and the order is alphabetical on purpose
--
-- Two Instagram accounts on one page is a mistake, not a feature, so
-- UNIQUE (provider_id, kind) says so. There is no sort column: the provider has
-- at most seven of these and nobody has ever wanted to reorder them. Reading
-- them `ORDER BY kind` gives one order that two different queries cannot drift
-- apart on, which a hand-picked "nicer" order would not.

CREATE TABLE provider_links (
    id          uuid         PRIMARY KEY,
    provider_id uuid         NOT NULL,
    kind        varchar(16)  NOT NULL,
    -- The handle for a network, or the whole URL for WEBSITE. Never rendered as
    -- an href as it stands: the edge composes it.
    value       varchar(200) NOT NULL,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),

    -- Closed, and closed HERE rather than in an application that remembers. A
    -- kind the page has no icon for renders as a gap.
    CONSTRAINT ck_provider_links_kind CHECK (kind IN (
        'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'X',
        'WEBSITE')),

    -- A handle, and everything a handle may not contain. No colon, so no
    -- scheme. No leading slash and no empty segment, so the composed URL cannot
    -- change host. No `?` and no `#`, so it cannot smuggle a query onto a page
    -- that was not expecting one. Up to four segments, because a Facebook page
    -- can be `people/Nom/100064...` and a YouTube channel `channel/UC...`.
    CONSTRAINT ck_provider_links_handle CHECK (
        kind = 'WEBSITE'
        OR value ~ '^@?[A-Za-z0-9][A-Za-z0-9._-]{0,63}(/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){0,3}$'),

    -- The one kind that carries a whole URL, and the four things that keep it
    -- from being an XSS: https only, a dotted host, no whitespace anywhere, and
    -- no query or fragment. The last is not squeamishness - a business's own
    -- address needs neither, and admitting them would put a string the provider
    -- controls after the `?` of a link this platform vouches for.
    CONSTRAINT ck_provider_links_website CHECK (
        kind <> 'WEBSITE'
        OR value ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(/[^[:space:]?#]*)?$'),

    CONSTRAINT fk_provider_links_provider
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,

    CONSTRAINT uq_provider_links_kind UNIQUE (provider_id, kind)
);

ALTER TABLE provider_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_links FORCE  ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Who may see a link, and who may write one.
-- ---------------------------------------------------------------------------
--
-- Unlike a review, this IS the provider's own words about itself, so the tenant
-- writes it: FOR ALL, not FOR SELECT. What the provider still cannot do is put
-- a link on somebody else's page, and that is the predicate rather than a
-- promise.
CREATE POLICY provider_links_tenant_all ON provider_links
    FOR ALL
    USING      (provider_id = app_current_provider())
    WITH CHECK (provider_id = app_current_provider());

-- The public read, gated on the same two facts every other public projection is
-- gated on. A suspended business's links leave the hub with the rest of it.
CREATE POLICY provider_links_public_read ON provider_links
    FOR SELECT
    USING (app_current_provider() IS NULL
           AND provider_id IN (SELECT id FROM providers
                                WHERE published AND status = 'ACTIVE'));

CREATE POLICY provider_links_moderation ON provider_links
    FOR ALL TO balaaca_moderator
    USING (true) WITH CHECK (true);

-- FORCE binds the owner too, so without this a later backfill would update zero
-- rows and report success.
CREATE POLICY provider_links_maintenance ON provider_links
    FOR ALL TO balaaca_migrator
    USING (true) WITH CHECK (true);

-- DELETE is granted because the profile is replaced whole, exactly as a week of
-- opening hours is: the set the provider submitted becomes the set that exists,
-- in one transaction, with no moment in between where the page shows neither.
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_links TO balaaca_app;
GRANT SELECT, DELETE ON provider_links TO balaaca_moderator;
