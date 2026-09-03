-- The first thing on the home page is French with the accents left off it.
--
-- "Esthetique et soins", "Patisserie", "Electricite", "Beaute",
-- "Evenementiel", "Boke", "Labe", "Nzerekore". Thirty-five trades, eight
-- families and fifty-one localities, all seeded plain by V016, V025 and V029,
-- and every one of them is copy a customer reads before deciding whether this
-- platform is worth an account.
--
-- ACCENTING THEM ALONE WOULD BREAK THE SEARCH BOX, and that is why this is one
-- migration and not two. The directory matches
--     c.label_fr ILIKE '%' || :name || '%'
-- with no fold on either side. Put the accents on and nobody typing
-- "esthetique" on a phone keyboard, which is what everybody types, reaches the
-- trade any more: the box that is the whole point of the home page would answer
-- nothing for the very words this file just corrected.
--
-- So the fold lands first, in this same file, and the labels follow it.

-- ---------------------------------------------------------------------------
-- 1. One fold, and a folded copy of every column the search box matches
-- ---------------------------------------------------------------------------
-- unaccent() is the obvious answer and it cannot be used: the extension ships
-- it STABLE rather than IMMUTABLE, because its behaviour depends on a
-- dictionary that can be reloaded, so it may appear neither in a generated
-- column nor in an index. translate() and btrim() are immutable and do the one
-- job needed here.
--
-- A function rather than the expression written out at each site, because it is
-- needed at four of them: three stored columns and the customer's own word,
-- which is folded by the SAME call on the other side of the comparison. Four
-- copies of a hundred-character character map is four chances to mistype one,
-- and a mistyped map does not fail - it silently stops matching one letter.
--
-- IMMUTABLE is a promise about this body. Change it and the three stored
-- columns keep the values it produced before the change: they are recomputed on
-- write, not on read. Editing this function means rewriting those columns in
-- the same migration.
--
-- No lower(). V043 recorded why for upper() and the same holds here: case
-- folding is collation-dependent, and a Turkish locale maps I and i onto
-- letters this alphabet does not have. A to Z is in the map instead, so the
-- fold is ASCII in and ASCII out and does not depend on where the server runs.
--
-- The accented set is V043's, which is the fullest one this repository has.
-- V030's area_folded carries a shorter map inline; it is not moved onto this
-- function here, because changing a stored column's expression rewrites the
-- table and the quartier filter compares whole values rather than substrings,
-- so nothing it does is wrong today.
CREATE FUNCTION app_fold(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
    SELECT btrim(translate(
        p_value,
        'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöøùúûüýÿÆæŒœABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'aaaaaaceeeeiiiinoooooouuuuyaaaaaaceeeeiiiinoooooouuuuyyaaooabcdefghijklmnopqrstuvwxyz'))
$fn$;

COMMENT ON FUNCTION app_fold(text) IS
    'Accent and case fold for search. Both sides of every match call it: the '
    'stored columns that end in _folded, and the word the customer typed.';

GRANT EXECUTE ON FUNCTION app_fold(text) TO balaaca_app;

-- Generated and STORED rather than an index over app_fold(column), for the
-- reason V030 gave for area_folded: a stored column cannot drift from the
-- column it folds. It also keeps the planner out of it - a plain column index
-- always matches the query, while an expression index over a SQL function stops
-- matching the moment the call is inlined on one side and not the other.
ALTER TABLE providers ADD COLUMN business_name_folded varchar(120)
    GENERATED ALWAYS AS (app_fold(business_name)) STORED;

ALTER TABLE provider_categories ADD COLUMN label_fr_folded varchar(80)
    GENERATED ALWAYS AS (app_fold(label_fr)) STORED;

-- The third branch of the same OR, and the one where accents actually occur
-- today: a salon writes "Défrisage" or "Defrisage" as it pleases, and the
-- platform never chose either spelling. Leaving it out would fix two thirds of
-- a search box and leave the third that carries the provider's own words.
ALTER TABLE service_offerings ADD COLUMN name_folded varchar(120)
    GENERATED ALWAYS AS (app_fold(name)) STORED;

-- Same shape as V004's and V022's: gin_trgm_ops, because the match is
-- LIKE '%x%', and partial on `active` wherever a retired row is never searched.
CREATE INDEX ix_providers_name_folded_trgm
    ON providers USING gin (business_name_folded gin_trgm_ops);
CREATE INDEX ix_provider_categories_label_folded_trgm
    ON provider_categories USING gin (label_fr_folded gin_trgm_ops) WHERE active;
CREATE INDEX ix_service_offerings_name_folded_trgm
    ON service_offerings USING gin (name_folded gin_trgm_ops) WHERE active;

-- The three they replace. Nothing else on the platform matches these columns
-- with ILIKE or with a similarity operator, so once the directory reads the
-- folded copies they serve no query at all: three GIN indexes rewritten on
-- every registration, every profile edit and every service a provider saves,
-- for nobody.
DROP INDEX ix_providers_name_trgm;
DROP INDEX ix_provider_categories_label_trgm;
DROP INDEX ix_service_offerings_name_trgm;

-- Not folded, and each for its own reason. providers.city and providers.area
-- are what a provider typed, and area already has area_folded from V030.
-- localities.aliases is folded by contract, one entry per accepted spelling.
-- localities.label_fr and provider_category_families.label_fr are displayed and
-- never matched: the locality filter resolves on slug and aliases, and a family
-- is a heading. A folded copy of a column no query compares is a column that
-- goes stale in a reader's head.

-- ---------------------------------------------------------------------------
-- 2. The trades
-- ---------------------------------------------------------------------------
-- Sixteen of the thirty-five carry an accent. The other nineteen genuinely do
-- not, and they are named at the foot of this section so that the next reader
-- does not have to wonder whether they were forgotten.
--
-- SLUGS ARE UNTOUCHED. They are ASCII, they are the public filter key, and they
-- are in URLs a customer may have kept.
UPDATE provider_categories c
   SET label_fr = v.label_fr, updated_at = now()
  FROM (VALUES
    ('esthetique',                'Esthétique et soins'),
    ('video',                     'Vidéo'),
    ('sonorisation-eclairage',    'Sonorisation et éclairage'),
    ('decoration-evenementielle', 'Décoration événementielle'),
    ('patisserie',                'Pâtisserie'),
    ('location-vehicule',         'Location de véhicule'),
    ('mecanique-auto',            'Mécanique auto'),
    ('mecanique-moto',            'Mécanique moto'),
    ('auto-ecole',                'Auto-école'),
    ('electricite',               'Électricité'),
    ('nettoyage',                 'Nettoyage et ménage'),
    ('demenagement',              'Déménagement'),
    ('desinsectisation',          'Désinsectisation'),
    ('securite-electronique',     'Caméras et alarmes'),
    ('reparation-telephone',      'Réparation téléphone'),
    ('cours-particuliers',        'Répétiteur et cours')
  ) AS v(slug, label_fr)
 WHERE c.slug = v.slug;

-- Left exactly as V016 and V025 wrote them, because French puts no accent on
-- any of them: coiffure, barbier, tresses, onglerie, maquillage, spa-massage,
-- couture, photographie, dj-animation, traiteur, fleuriste, location-salle,
-- lavage-auto, climatisation, plomberie, energie-solaire, cours-langues,
-- formation-professionnelle, coach-sportif.

-- ---------------------------------------------------------------------------
-- 3. The families
-- ---------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY binds the owner too, and V025 gave this table its
-- maintenance policy for balaaca_migrator. Without that policy this UPDATE
-- would match zero rows and report success, which is the failure V015 was
-- written to close.
UPDATE provider_category_families f
   SET label_fr = v.label_fr, updated_at = now()
  FROM (VALUES
    ('beaute',    'Beauté'),
    ('bien-etre', 'Bien-être et sport'),
    ('evenement', 'Événementiel'),
    ('table',     'Traiteur et pâtisserie'),
    ('maison',    'Maison et réparation')
  ) AS v(slug, label_fr)
 WHERE f.slug = v.slug;

-- Left plain: atelier, auto, savoir.

-- ---------------------------------------------------------------------------
-- 4. The places
-- ---------------------------------------------------------------------------
-- A wrong place name is worse than a plain one, so only the names this file is
-- certain of are touched, and the thirty-eight that carry no accent are listed
-- rather than left to inference.
--
-- N'Zérékoré is written the way Guinean administration writes it, with
-- the apostrophe and three acutes. It is the label only: the slug stays
-- `nzerekore`, and `aliases` keeps `{nzerekore}` - that array is the column the
-- locality filter resolves on and it is unaccented by contract, so a customer
-- typing the plain form still lands on the row.
--
-- Region and prefecture share a name here, which is why Boké, Labé and
-- N'Zérékoré each appear twice: V029 gave the region the `-region` slug and the
-- prefecture the plain one, and the two labels were always identical.
UPDATE localities l
   SET label_fr = v.label_fr, updated_at = now()
  FROM (VALUES
    ('boke-region',      'Boké'),
    ('labe-region',      'Labé'),
    ('nzerekore-region', 'N''Zérékoré'),
    ('boke',             'Boké'),
    ('labe',             'Labé'),
    ('nzerekore',        'N''Zérékoré'),
    ('kerouane',         'Kérouané'),
    ('dubreka',          'Dubréka'),
    ('forecariah',       'Forécariah'),
    ('telimele',         'Télimélé'),
    ('lelouma',          'Lélouma'),
    ('tougue',           'Tougué'),
    ('gueckedou',        'Guéckédou')
  ) AS v(slug, label_fr)
 WHERE l.slug = v.slug;

-- Carry no accent, checked one by one and left alone.
--   Regions:     conakry, kindia-region, mamou-region, faranah-region,
--                kankan-region
--   Prefectures: boffa, fria, gaoual, koundara, dabola, dinguiraye, faranah,
--                kissidougou, kankan, kouroussa, mandiana, siguiri, coyah,
--                kindia, koubia, mali, dalaba, mamou, pita, beyla, lola,
--                macenta, yomou
--   Communes:    kaloum, dixinn, matam, ratoma, lambanyi, sonfonia, matoto,
--                gbessia, tombolia, kassa - the whole of Conakry, none of which
--                takes one.
