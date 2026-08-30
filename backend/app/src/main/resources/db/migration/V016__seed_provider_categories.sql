-- The hub had no trades to browse. provider_categories has existed since V003
-- and nothing ever put a row in it, so "Parcourir par metier" listed nothing and
-- every provider registered with no category at all.
--
-- The taxonomy is CURATED, not provider-authored, and that is the decision this
-- migration records. A category is a navigation device: its whole value is that
-- many providers share it. Left to free text you get "Coiffure", "coiffure",
-- "Coiffeuse", "Salon de coiffure" and "Tresses & Coiffure", each matching one
-- business - the hub stops working exactly when it starts having providers.
--
-- Granularity is not lost, it lives one level down. service_offerings is free
-- text per provider: "Tresses collees", "Defrisage", "Pose d'ongles americaine".
-- The customer navigates by trade and then reads the salon's own words.
--
-- These are TRADES. "Mariage" is deliberately absent, because it is an occasion
-- and not a trade: a photographer shoots weddings and corporate events and
-- portraits, and providers.category_id holds one value. A wedding section on the
-- hub is a query over several of these slugs, which listProviders now accepts -
-- no schema, no migration, and a photographer keeps being a photographer.
--
-- Adding one later is a single row. category_id is nullable, so a trade nobody
-- foresaw does not block a registration, and name search reaches that provider
-- anyway through the trigram index.
INSERT INTO provider_categories (id, slug, label_fr, icon, sort_order) VALUES
    ('ca7e0001-0000-4000-8000-000000000001','coiffure',                  'Coiffure',                  'scissors',   10),
    ('ca7e0001-0000-4000-8000-000000000002','barbier',                   'Barbier',                   'razor',      20),
    ('ca7e0001-0000-4000-8000-000000000003','tresses',                   'Tresses et locks',          'braid',      30),
    ('ca7e0001-0000-4000-8000-000000000004','esthetique',                'Esthetique et soins',       'sparkle',    40),
    ('ca7e0001-0000-4000-8000-000000000005','onglerie',                  'Onglerie',                  'nail',       50),
    ('ca7e0001-0000-4000-8000-000000000006','maquillage',                'Maquillage',                'brush',      60),
    ('ca7e0001-0000-4000-8000-000000000007','spa-massage',               'Spa et massage',            'lotus',      70),
    ('ca7e0001-0000-4000-8000-000000000008','couture',                   'Couture et retouches',      'needle',     80),
    -- Ce qu'un mariage demande. Chacun reste un metier a part entiere.
    ('ca7e0001-0000-4000-8000-000000000009','photographie',              'Photographie',              'camera',     90),
    ('ca7e0001-0000-4000-8000-00000000000a','video',                     'Video',                     'video',     100),
    ('ca7e0001-0000-4000-8000-00000000000b','dj-animation',              'DJ et animation',           'disc',      110),
    ('ca7e0001-0000-4000-8000-00000000000c','sonorisation-eclairage',    'Sonorisation et eclairage', 'speaker',   120),
    ('ca7e0001-0000-4000-8000-00000000000d','decoration-evenementielle', 'Decoration evenementielle', 'flower',    130),
    ('ca7e0001-0000-4000-8000-00000000000e','traiteur',                  'Traiteur',                  'plate',     140),
    ('ca7e0001-0000-4000-8000-00000000000f','patisserie',                'Patisserie',                'cake',      150),
    ('ca7e0001-0000-4000-8000-000000000010','fleuriste',                 'Fleuriste',                 'bouquet',   160),
    ('ca7e0001-0000-4000-8000-000000000011','location-salle',            'Location de salle',         'building',  170),
    ('ca7e0001-0000-4000-8000-000000000012','location-vehicule',         'Location de vehicule',      'car',       180)
ON CONFLICT (slug) DO NOTHING;
