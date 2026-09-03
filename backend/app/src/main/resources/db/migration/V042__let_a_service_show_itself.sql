-- A price without a picture is not a description.
--
-- A customer choosing between "Tresses collees - 150 000" and "Tresses torsades
-- - 200 000" cannot tell the difference from the words. In braiding, in nails,
-- in event decoration, in catering, the photograph IS the specification: it is
-- what the customer is buying, and the text is a label on it.
--
--
-- Why the photographs hang off the SERVICE and not off the provider
--
-- A gallery on the provider was the other candidate and it is the weaker one.
-- It answers "is this place any good", which a photograph of the work answers
-- too - and better, because it is attached to something bookable. A gallery is
-- pictures that lead nowhere.
--
-- And it is not a choice between two features. If every service carries its own
-- photographs, the provider's gallery is their union: it comes for free, every
-- picture in it leads to a price and a button, and there is one table instead
-- of two. Building both would be building the same thing twice and then having
-- to decide which one a customer is looking at.
--
--
-- Five, and why there is a number at all
--
-- Not storage - five pictures is nothing. It is the page. The market is
-- mid-range Android telephones on 3G, and a catalogue of twelve services with
-- no cap is a page that never finishes loading, which costs the provider every
-- customer who closes it. A cap is a promise about the page, and it is enforced
-- here because an application check is a check somebody can forget.

CREATE TABLE service_photos (
    id                  uuid        PRIMARY KEY,
    provider_id         uuid        NOT NULL,
    service_offering_id uuid        NOT NULL,
    -- The name the image store minted, exactly like providers.logo_url. It
    -- discloses nothing: not the provider, not the kind, not the original
    -- filename, which is a value the platform would have to distrust and would
    -- gain nothing from trusting.
    stored_name         varchar(120) NOT NULL,
    -- The provider's own arrangement. First is the one that represents the
    -- service in a list, so it is worth being able to choose it.
    sort_order          int         NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_service_photos_sort CHECK (sort_order >= 0 AND sort_order < 5),

    -- Composite, so a photograph can never be filed against one provider naming
    -- another's service.
    CONSTRAINT fk_service_photos_offering
        FOREIGN KEY (provider_id, service_offering_id)
        REFERENCES service_offerings (provider_id, id) ON DELETE CASCADE,

    -- The cap, as a constraint rather than as a count in Java. Five slots, and
    -- two photographs cannot hold the same one: an INSERT beyond the fifth has
    -- nowhere to go and is refused by the index rather than by a check that
    -- raced.
    CONSTRAINT uq_service_photos_slot UNIQUE (service_offering_id, sort_order),
    CONSTRAINT uq_service_photos_name UNIQUE (stored_name)
);

CREATE INDEX ix_service_photos_by_offering
    ON service_photos (service_offering_id, sort_order);

ALTER TABLE service_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_photos FORCE  ROW LEVEL SECURITY;

CREATE POLICY service_photos_tenant ON service_photos
    FOR ALL
    USING      (provider_id = app_current_provider())
    WITH CHECK (provider_id = app_current_provider());

-- The same public read the catalogue has, and it has to exist: these are
-- published on a page a stranger reads, and the directory reads them with no
-- tenant bound. Only for a service that is itself public - a photograph of a
-- retired service on a suspended salon must disappear with everything else.
CREATE POLICY service_photos_public_read ON service_photos
    FOR SELECT
    USING (app_current_provider() IS NULL
           AND service_offering_id IN (
               SELECT o.id FROM service_offerings o
                JOIN providers p ON p.id = o.provider_id
               WHERE o.active AND p.published AND p.status = 'ACTIVE'));

CREATE POLICY service_photos_maintenance ON service_photos
    FOR ALL TO balaaca_migrator
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON service_photos TO balaaca_app;
