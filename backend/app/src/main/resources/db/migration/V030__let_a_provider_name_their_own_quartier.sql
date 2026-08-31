-- The finest thing a customer in Conakry actually says is a quartier, and it is
-- the one level the platform cannot author.
--
-- V028 holds what is closed: regions, prefectures, the capital's communes. Below
-- that there are thousands of quartiers and rural districts across the country,
-- they change, and no list this repository could carry would be complete. A
-- curated table of them has exactly one guaranteed property: it is missing the
-- one the next provider needs, and that provider cannot say where they are.
--
-- So the quartier is written by the provider, and the values grow from
-- registrations instead of migrations. Somebody in Siguiri can say where they
-- are on the first day.

-- What they typed, kept as they typed it - that is what goes on the page, with
-- their capitals and their spelling.
ALTER TABLE providers ADD COLUMN area varchar(80);

-- And what it is MATCHED on. Folded once, on write, rather than at every read:
-- lower-cased and stripped of accents, so "Ratoma", "ratoma" and "RATOMA" are
-- one filter value.
--
-- This is the answer to what V016 warned about - "Coiffure", "coiffure",
-- "Coiffeuse", each matching one business - without pretending the platform can
-- enumerate the country. Curation cannot apply here; folding plus type-ahead
-- over the values that already exist can, and it is what makes the tenth
-- hairdresser in Nongo pick the Nongo the first nine created.
--
-- Generated and STORED, so it cannot drift from the column it folds. unaccent()
-- is not immutable in its default form, so the fold is spelled out: it is the
-- accented letters that actually occur in Guinean place names, and a letter this
-- misses costs a near-duplicate value, never a wrong match.
ALTER TABLE providers ADD COLUMN area_folded varchar(80)
    GENERATED ALWAYS AS (
        nullif(btrim(lower(translate(area,
            'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
            'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))), '')
    ) STORED;

-- The filter, and the type-ahead that keeps it from fragmenting.
CREATE INDEX ix_providers_area_folded ON providers (area_folded)
    WHERE area_folded IS NOT NULL;
-- So a partial word reaches it: somebody typing "nong" is offered "Nongo".
CREATE INDEX ix_providers_area_trgm ON providers USING gin (area_folded gin_trgm_ops);

COMMENT ON COLUMN providers.area IS
    'The neighbourhood, as the provider writes it. Free text on purpose: the '
    'platform cannot enumerate Guinea''s quartiers, and a curated list would '
    'fail exactly the provider whose own is missing. Matched on area_folded.';

-- ---------------------------------------------------------------------------
-- What already exists
-- ---------------------------------------------------------------------------
-- providers.city carried whatever a provider typed. Where it names a locality
-- this repository knows, V029 already adopted it. What is left is the rest -
-- "Nongo", "Kipe", a quartier - and it belongs here rather than nowhere.
UPDATE providers p
   SET area = p.city
 WHERE p.locality_id IS NULL
   AND p.city IS NOT NULL
   AND btrim(p.city) <> '';
