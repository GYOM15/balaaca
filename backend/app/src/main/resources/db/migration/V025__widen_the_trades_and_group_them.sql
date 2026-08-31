-- The hub was a beauty parlour with a wedding annexe.
--
-- Eighteen trades: eight of beauty, seven of events, two of hire, one of
-- sewing. No car, no house, no repair, no teaching. A mechanic could not
-- register at all - the trade is a closed list and there was no row for him.
-- That is not a gap the design tool introduced; V016 is where it was decided,
-- and this is where it is corrected.
--
-- Seventeen more, chosen against one rule that V016 already set: a category is
-- a navigation device, and its value is that many providers share it. Where the
-- slot model strains for one of them - a garage keeps the car, a repairer works
-- ten devices at once - that is answered by the fulfilment column of V027, not
-- by leaving the trade out.
--
-- Deliberately NOT here: health. A dentist's chair is literally a chair and the
-- appointment predates the software, so it would pass every test this list was
-- held to. It is out because appointments.service_name travels through the
-- notifications outbox to a named telephone, and "Consultation dermatologie"
-- beside a phone number is health data about an identified person. V028 fixes
-- that payload; health can be argued after, on its own merits.

-- ---------------------------------------------------------------------------
-- 1. Families, because thirty-five tiles is not a list anyone reads
-- ---------------------------------------------------------------------------
-- Eighteen fitted in one grid. Thirty-five do not, and the alternative to a
-- grouping is that a client scrolls past thirty-four trades to reach theirs.
--
-- A separate table rather than a column, for the reason provider_categories is
-- itself a table: a label repeated on every row is a label that drifts on some
-- of them. And it stays a REFERENCE table - curated here, never written by a
-- provider.
CREATE TABLE provider_category_families (
    id         uuid PRIMARY KEY,
    slug       varchar(60) NOT NULL UNIQUE,
    label_fr   varchar(80) NOT NULL,
    icon       varchar(40),
    sort_order int NOT NULL DEFAULT 0,
    active     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO provider_category_families (id, slug, label_fr, icon, sort_order) VALUES
    ('fa77e001-0000-4000-8000-000000000001','beaute',     'Beaute',                'sparkle',  10),
    ('fa77e001-0000-4000-8000-000000000002','bien-etre',  'Bien-etre et sport',    'lotus',    20),
    ('fa77e001-0000-4000-8000-000000000003','atelier',    'Couture et artisanat',  'needle',   30),
    ('fa77e001-0000-4000-8000-000000000004','evenement',  'Evenementiel',          'camera',   40),
    ('fa77e001-0000-4000-8000-000000000005','table',      'Traiteur et patisserie','plate',    50),
    ('fa77e001-0000-4000-8000-000000000006','auto',       'Auto et moto',          'car',      60),
    ('fa77e001-0000-4000-8000-000000000007','maison',     'Maison et reparation',  'wrench',   70),
    ('fa77e001-0000-4000-8000-000000000008','savoir',     'Cours et formation',    'book',     80);

-- Nullable: a trade that fits no family is still a trade, and a category with
-- no family lands in a "Divers" bucket a client can still reach rather than
-- blocking the migration that adds it.
ALTER TABLE provider_categories
    ADD COLUMN family_id uuid REFERENCES provider_category_families(id);

CREATE INDEX ix_provider_categories_family ON provider_categories (family_id);

-- Readable by anyone, like the categories themselves: the hub is public and a
-- family is a heading on it. FORCE RLS binds the owner too, hence the
-- maintenance policy - without it the next backfill matches zero rows and
-- reports success.
ALTER TABLE provider_category_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_category_families FORCE  ROW LEVEL SECURITY;
CREATE POLICY provider_category_families_read ON provider_category_families
    FOR SELECT TO balaaca_app USING (true);
CREATE POLICY provider_category_families_maintenance ON provider_category_families
    FOR ALL TO balaaca_migrator USING (true) WITH CHECK (true);
GRANT SELECT ON provider_category_families TO balaaca_app;

-- ---------------------------------------------------------------------------
-- 2. The eighteen that exist, placed
-- ---------------------------------------------------------------------------
UPDATE provider_categories c SET family_id = f.id
  FROM provider_category_families f
 WHERE (f.slug, c.slug) IN (
    ('beaute','coiffure'), ('beaute','barbier'), ('beaute','tresses'),
    ('beaute','esthetique'), ('beaute','onglerie'), ('beaute','maquillage'),
    -- spa-massage leaves beauty for well-being, where the sports coach joins
    -- it. A massage is closer to a training session than to a haircut in what
    -- the customer is buying: an hour of somebody's attention on their body.
    ('bien-etre','spa-massage'),
    ('atelier','couture'),
    ('evenement','photographie'), ('evenement','video'), ('evenement','dj-animation'),
    ('evenement','sonorisation-eclairage'), ('evenement','decoration-evenementielle'),
    ('evenement','fleuriste'), ('evenement','location-salle'),
    ('table','traiteur'), ('table','patisserie'),
    ('auto','location-vehicule'));

-- ---------------------------------------------------------------------------
-- 3. The seventeen new
-- ---------------------------------------------------------------------------
-- sort_order continues V016's tens so a trade can still be inserted between two
-- others without renumbering the world.
--
-- Labels are the words a customer in Conakry uses, not the trade school's.
-- "Climatisation" and not "Froid et climatisation" - the diploma says the
-- second, the client says "la clim". "Repetiteur" beside "cours particuliers",
-- because a parent here asks for a repetiteur.
INSERT INTO provider_categories (id, slug, label_fr, icon, sort_order, family_id) VALUES
    -- Auto et moto. Conakry receives three to four thousand imported used
    -- vehicles a month and runs on taxi-motos; the same directory that lists
    -- six florists lists ninety-one garages, and the florist already had a tile.
    ('ca7e0002-0000-4000-8000-000000000001','mecanique-auto',    'Mecanique auto',            'wrench',   190,
     (SELECT id FROM provider_category_families WHERE slug='auto')),
    ('ca7e0002-0000-4000-8000-000000000002','mecanique-moto',    'Mecanique moto',            'bike',     200,
     (SELECT id FROM provider_category_families WHERE slug='auto')),
    ('ca7e0002-0000-4000-8000-000000000003','lavage-auto',       'Lavage auto',               'droplet',  210,
     (SELECT id FROM provider_category_families WHERE slug='auto')),
    ('ca7e0002-0000-4000-8000-000000000004','auto-ecole',        'Auto-ecole',                'steering', 220,
     (SELECT id FROM provider_category_families WHERE slug='auto')),

    -- Maison et reparation. Forty-nine refrigeration firms in the same
    -- directory, in a city at thirty degrees and eighty per cent humidity, and
    -- a grid that fails often enough that solar and generators are a trade.
    ('ca7e0002-0000-4000-8000-000000000005','climatisation',     'Climatisation',             'snowflake',230,
     (SELECT id FROM provider_category_families WHERE slug='maison')),
    ('ca7e0002-0000-4000-8000-000000000006','plomberie',         'Plomberie',                 'pipe',     240,
     (SELECT id FROM provider_category_families WHERE slug='maison')),
    ('ca7e0002-0000-4000-8000-000000000007','electricite',       'Electricite',               'bolt',     250,
     (SELECT id FROM provider_category_families WHERE slug='maison')),
    ('ca7e0002-0000-4000-8000-000000000008','energie-solaire',   'Solaire et groupes',        'sun',      260,
     (SELECT id FROM provider_category_families WHERE slug='maison')),
    ('ca7e0002-0000-4000-8000-000000000009','nettoyage',         'Nettoyage et menage',       'broom',    270,
     (SELECT id FROM provider_category_families WHERE slug='maison')),
    ('ca7e0002-0000-4000-8000-00000000000a','demenagement',      'Demenagement',              'truck',    280,
     (SELECT id FROM provider_category_families WHERE slug='maison')),
    ('ca7e0002-0000-4000-8000-00000000000b','desinsectisation',  'Desinsectisation',          'bug',      290,
     (SELECT id FROM provider_category_families WHERE slug='maison')),
    ('ca7e0002-0000-4000-8000-00000000000c','securite-electronique','Cameras et alarmes',     'shield',   300,
     (SELECT id FROM provider_category_families WHERE slug='maison')),
    ('ca7e0002-0000-4000-8000-00000000000d','reparation-telephone','Reparation telephone',    'phone',    310,
     (SELECT id FROM provider_category_families WHERE slug='maison')),

    -- Cours et formation. The repetiteur is an institution in a Conakry
    -- household, and a lesson is an hour at a fixed time - the cleanest fit of
    -- the whole list to what this product sells.
    ('ca7e0002-0000-4000-8000-00000000000e','cours-particuliers','Repetiteur et cours',       'book',     320,
     (SELECT id FROM provider_category_families WHERE slug='savoir')),
    ('ca7e0002-0000-4000-8000-00000000000f','cours-langues',     'Cours de langues',          'message',  330,
     (SELECT id FROM provider_category_families WHERE slug='savoir')),
    ('ca7e0002-0000-4000-8000-000000000010','formation-professionnelle','Formation pro',      'graduate', 340,
     (SELECT id FROM provider_category_families WHERE slug='savoir')),

    -- Bien-etre.
    ('ca7e0002-0000-4000-8000-000000000011','coach-sportif',     'Coach sportif',             'activity', 350,
     (SELECT id FROM provider_category_families WHERE slug='bien-etre'));
