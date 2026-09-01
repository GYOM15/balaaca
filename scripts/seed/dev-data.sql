-- Balaaca - a directory with something in it.
--
-- NOT a Flyway migration, deliberately: a migration runs everywhere, and test
-- data that reaches production is a salon nobody can explain. This is a script,
-- run on demand by scripts/seed.sh, against a development database only.
--
-- It is idempotent by deletion: every row it writes carries a well-known uuid
-- prefixed 5eed…, and it removes those before writing them again. It therefore
-- never touches a row the product created - including the account you register
-- yourself and the business you attach to it.
--
-- What it does NOT create is a Keycloak user. These businesses have an owner
-- row so the schema is coherent, but nobody can sign in as them: signing in is
-- what YOU do with your own account, and a seeded password would be a
-- credential in a repository.

BEGIN;

-- --------------------------------------------------------------------------
-- Out with the last run. Ordered by dependency, and scoped by the id prefix.
-- --------------------------------------------------------------------------
DELETE FROM appointments             WHERE id::text LIKE '5eed%';
DELETE FROM customers                WHERE id::text LIKE '5eed%';
DELETE FROM service_photos           WHERE provider_id::text LIKE '5eed%';
DELETE FROM staff_service_offerings  WHERE provider_id::text LIKE '5eed%';
DELETE FROM availability_overrides   WHERE provider_id::text LIKE '5eed%';
DELETE FROM availability_rules       WHERE provider_id::text LIKE '5eed%';
DELETE FROM service_offerings        WHERE provider_id::text LIKE '5eed%';
DELETE FROM provider_staff           WHERE provider_id::text LIKE '5eed%';
DELETE FROM providers                WHERE id::text LIKE '5eed%';
DELETE FROM users                    WHERE id::text LIKE '5eed%';

-- --------------------------------------------------------------------------
-- The people who own them.
--
-- keycloak_user_id is a uuid no realm will ever mint, so one of these can never
-- collide with a subject Keycloak hands out - and can never be signed in as.
-- --------------------------------------------------------------------------
INSERT INTO users (id, keycloak_user_id, display_name) VALUES
  ('5eed0001-0000-4000-8000-000000000001', 'seed:fatou',   'Fatoumata Camara'),
  ('5eed0001-0000-4000-8000-000000000002', 'seed:nene',    'Néné Bah'),
  ('5eed0001-0000-4000-8000-000000000003', 'seed:mariama', 'Mariama Diallo'),
  ('5eed0001-0000-4000-8000-000000000004', 'seed:camara',  'Sékou Camara'),
  ('5eed0001-0000-4000-8000-000000000005', 'seed:sylla',   'Ibrahima Sylla'),
  ('5eed0001-0000-4000-8000-000000000006', 'seed:kadiatou','Kadiatou Barry');

-- --------------------------------------------------------------------------
-- Six businesses, chosen to cover what the screens have to show: the three
-- fulfilments, several trades, several places, a solo trader and a team.
-- --------------------------------------------------------------------------
INSERT INTO providers (
    id, slug, business_name, category_id, description,
    public_phone_e164, whatsapp_phone_e164, country_code,
    locality_id, area, address_line, timezone,
    slot_granularity_minutes, min_lead_time_minutes, max_advance_days,
    cancellation_deadline_minutes, auto_confirm, status, published)
SELECT v.id, v.slug, v.business_name, c.id, v.description,
       v.phone, v.phone, 'GN',
       l.id, v.area, v.address_line, 'Africa/Conakry',
       15, 120, 60, 240, v.auto_confirm, 'ACTIVE', true
FROM (VALUES
  ('5eed0002-0000-4000-8000-000000000001'::uuid, 'salon-fatou', 'Salon Fatou',
   'coiffure', 'Coiffure femme et enfant, soin du cheveu naturel. Deux places, on prend le temps.',
   '+224622010101', 'ratoma', 'Nongo', 'Route Le Prince, en face de la pharmacie', true),
  ('5eed0002-0000-4000-8000-000000000002'::uuid, 'tresses-nene', 'Tresses Néné',
   'tresses', 'Tresses collées, twists et locks. Mèches fournies ou apportées.',
   '+224622020202', 'matam', 'Coléah', 'Carrefour Coléah, immeuble bleu', true),
  ('5eed0002-0000-4000-8000-000000000003'::uuid, 'atelier-mariama', 'Atelier Mariama',
   'couture', 'Couture sur mesure et retouches. Vous déposez, vous repassez.',
   '+224622030303', 'kaloum', 'Almamya', 'Rue KA-020, près du marché', false),
  ('5eed0002-0000-4000-8000-000000000004'::uuid, 'garage-camara-fils', 'Garage Camara et fils',
   'mecanique-auto', 'Vidange, freins, diagnostic. Dépannage sur place dans Conakry.',
   '+224622040404', 'matoto', 'Gbessia', 'Route de l’aéroport, après le rond-point', false),
  ('5eed0002-0000-4000-8000-000000000005'::uuid, 'sylla-plomberie', 'Sylla Plomberie',
   'plomberie', 'Fuites, chauffe-eau, robinetterie. On se déplace chez vous.',
   '+224622050505', 'dixinn', 'Kipé', NULL, false),
  ('5eed0002-0000-4000-8000-000000000006'::uuid, 'douceur-de-kipe', 'Douceur de Kipé',
   'patisserie', 'Gâteaux d’anniversaire et de mariage, sur commande.',
   '+224622060606', 'ratoma', 'Kipé', 'Cité de l’air, villa 12', false)
) AS v(id, slug, business_name, trade, description, phone, locality, area, address_line, auto_confirm)
JOIN provider_categories c ON c.slug = v.trade
JOIN localities l ON l.slug = v.locality;

-- --------------------------------------------------------------------------
-- Who works there. Two of them have a colleague, so "any available person"
-- has something to choose between and the team screen is not one row.
-- --------------------------------------------------------------------------
INSERT INTO provider_staff (id, provider_id, user_id, display_name, role, bookable, status) VALUES
  ('5eed0003-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000001', 'Fatoumata Camara', 'OWNER', true,  'ACTIVE'),
  ('5eed0003-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000001', NULL,                                   'Aminata Sow',      'STAFF', true,  'ACTIVE'),
  ('5eed0003-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000002', 'Néné Bah',         'OWNER', true,  'ACTIVE'),
  ('5eed0003-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000003', 'Mariama Diallo',   'OWNER', true,  'ACTIVE'),
  ('5eed0003-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000004', 'Sékou Camara',     'OWNER', true,  'ACTIVE'),
  ('5eed0003-0000-4000-8000-000000000006', '5eed0002-0000-4000-8000-000000000004', NULL,                                   'Ousmane Bangoura', 'STAFF', true,  'ACTIVE'),
  -- Not bookable: an apprentice who is on the team screen and never on a slot.
  ('5eed0003-0000-4000-8000-000000000007', '5eed0002-0000-4000-8000-000000000004', NULL,                                   'Fanta Diallo',     'STAFF', false, 'ACTIVE'),
  ('5eed0003-0000-4000-8000-000000000008', '5eed0002-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000005', 'Ibrahima Sylla',   'OWNER', true,  'ACTIVE'),
  ('5eed0003-0000-4000-8000-000000000009', '5eed0002-0000-4000-8000-000000000006', '5eed0001-0000-4000-8000-000000000006', 'Kadiatou Barry',   'OWNER', true,  'ACTIVE');

-- --------------------------------------------------------------------------
-- What they sell.
--
-- The three shapes the product publishes, and the schema spells them with two
-- columns rather than three values: AT_PROVIDER with no turnaround is "on the
-- spot", AT_PROVIDER with one is "drop it off", AT_CUSTOMER is "at your place".
-- All three appear below, because a screen that only ever sees one is a screen
-- nobody tested.
-- --------------------------------------------------------------------------
INSERT INTO service_offerings (
    id, provider_id, name, description, duration_minutes,
    buffer_before_minutes, buffer_after_minutes,
    price_amount_minor, price_currency, price_visible, active, sort_order,
    location_kind, turnaround_hours) VALUES
  -- Salon Fatou
  ('5eed0004-0000-4000-8000-000000000001','5eed0002-0000-4000-8000-000000000001','Tresses collées','Cornrows, mèches non comprises',180,0,15,150000,'GNF',true,true,0,'AT_PROVIDER',NULL),
  ('5eed0004-0000-4000-8000-000000000002','5eed0002-0000-4000-8000-000000000001','Défrisage','Produit doux, rinçage et brushing',90,0,15,90000,'GNF',true,true,1,'AT_PROVIDER',NULL),
  ('5eed0004-0000-4000-8000-000000000003','5eed0002-0000-4000-8000-000000000001','Coupe enfant',NULL,30,0,0,25000,'GNF',true,true,2,'AT_PROVIDER',NULL),
  ('5eed0004-0000-4000-8000-000000000004','5eed0002-0000-4000-8000-000000000001','Coiffure de mariée','Essai compris, à convenir ensemble',240,15,30,650000,'GNF',true,true,3,'AT_CUSTOMER',NULL),
  -- Tresses Néné
  ('5eed0004-0000-4000-8000-000000000005','5eed0002-0000-4000-8000-000000000002','Twists','Mèches fournies',150,0,15,120000,'GNF',true,true,0,'AT_PROVIDER',NULL),
  ('5eed0004-0000-4000-8000-000000000006','5eed0002-0000-4000-8000-000000000002','Reprise de locks',NULL,120,0,15,80000,'GNF',true,true,1,'AT_PROVIDER',NULL),
  ('5eed0004-0000-4000-8000-000000000007','5eed0002-0000-4000-8000-000000000002','Tresses à domicile','Dans Conakry uniquement',180,30,30,180000,'GNF',true,true,2,'AT_CUSTOMER',NULL),
  -- Atelier Mariama : the drop-off shape.
  ('5eed0004-0000-4000-8000-000000000008','5eed0002-0000-4000-8000-000000000003','Robe sur mesure','Prise de mesures, puis vous repassez',45,0,15,450000,'GNF',true,true,0,'AT_PROVIDER',168),
  ('5eed0004-0000-4000-8000-000000000009','5eed0002-0000-4000-8000-000000000003','Retouche ourlet',NULL,20,0,10,25000,'GNF',true,true,1,'AT_PROVIDER',48),
  ('5eed0004-0000-4000-8000-00000000000a','5eed0002-0000-4000-8000-000000000003','Boubou homme',NULL,45,0,15,350000,'GNF',true,true,2,'AT_PROVIDER',168),
  -- Garage Camara
  ('5eed0004-0000-4000-8000-00000000000b','5eed0002-0000-4000-8000-000000000004','Vidange','Huile et filtre compris',60,0,15,350000,'GNF',true,true,0,'AT_PROVIDER',NULL),
  ('5eed0004-0000-4000-8000-00000000000c','5eed0002-0000-4000-8000-000000000004','Plaquettes de frein','Pièces en sus, devis avant',120,0,30,200000,'GNF',true,true,1,'AT_PROVIDER',24),
  ('5eed0004-0000-4000-8000-00000000000d','5eed0002-0000-4000-8000-000000000004','Dépannage sur place','Dans Conakry, batterie et démarrage',60,30,30,250000,'GNF',true,true,2,'AT_CUSTOMER',NULL),
  -- Sylla Plomberie : at-customer only.
  ('5eed0004-0000-4000-8000-00000000000e','5eed0002-0000-4000-8000-000000000005','Recherche de fuite',NULL,90,30,30,200000,'GNF',true,true,0,'AT_CUSTOMER',NULL),
  ('5eed0004-0000-4000-8000-00000000000f','5eed0002-0000-4000-8000-000000000005','Pose de chauffe-eau','Appareil non compris',180,30,30,400000,'GNF',true,true,1,'AT_CUSTOMER',NULL),
  -- Douceur de Kipé
  ('5eed0004-0000-4000-8000-000000000010','5eed0002-0000-4000-8000-000000000006','Gâteau d’anniversaire','À commander 48 h à l’avance',30,0,15,300000,'GNF',true,true,0,'AT_PROVIDER',48),
  ('5eed0004-0000-4000-8000-000000000011','5eed0002-0000-4000-8000-000000000006','Pièce montée','Sur devis, dégustation possible',45,0,15,1200000,'GNF',true,true,1,'AT_PROVIDER',120);

-- Who does what. Everything is offered by every bookable person, except the
-- bridal work at Salon Fatou, which only the owner does - so the "with whom"
-- step has a service where the choice actually narrows.
INSERT INTO staff_service_offerings (provider_id, staff_id, service_offering_id)
SELECT s.provider_id, s.id, o.id
FROM provider_staff s
JOIN service_offerings o ON o.provider_id = s.provider_id
WHERE s.provider_id::text LIKE '5eed%' AND s.bookable
  AND NOT (o.id = '5eed0004-0000-4000-8000-000000000004'
           AND s.id <> '5eed0003-0000-4000-8000-000000000001');

-- --------------------------------------------------------------------------
-- When they are open. Monday to Saturday, and Salon Fatou takes Wednesday off,
-- so a closed weekday is a state the week view actually renders.
-- --------------------------------------------------------------------------
INSERT INTO availability_rules (id, provider_id, staff_id, day_of_week, start_time, end_time)
SELECT gen_random_uuid(), s.provider_id, s.id, d.dow, '08:00', '18:00'
FROM provider_staff s
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) AS d(dow)
WHERE s.provider_id::text LIKE '5eed%' AND s.bookable
  AND NOT (s.provider_id = '5eed0002-0000-4000-8000-000000000001' AND d.dow = 3);

COMMIT;
