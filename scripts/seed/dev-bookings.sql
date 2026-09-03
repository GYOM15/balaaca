-- Balaaca - customers and appointments, so a diary is not an empty page.
--
-- Run after dev-data.sql. Split from it because this half is the one that has
-- to reason about the clock: every instant below is relative to now, so the
-- seed is as useful on the day it is run as on the day it was written. A fixed
-- date would put the whole agenda in the past within a week.
--
-- The exclusion constraint is real here, and the derivation check with it:
-- blocked_from and blocked_until must be exactly starts_at and ends_at widened
-- by the frozen buffers, and no two live appointments may overlap on one
-- person. Both are respected below by construction rather than by luck.

BEGIN;

DELETE FROM appointments WHERE id::text LIKE '5eed%';
DELETE FROM customers    WHERE id::text LIKE '5eed%';

INSERT INTO customers (id, provider_id, full_name, phone_e164, notes) VALUES
  ('5eed0005-0000-4000-8000-000000000001','5eed0002-0000-4000-8000-000000000001','Aminata Diallo','+224620111111','Cuir chevelu sensible, pas de produit fort.'),
  ('5eed0005-0000-4000-8000-000000000002','5eed0002-0000-4000-8000-000000000001','Kadiatou Camara','+224620222222',NULL),
  ('5eed0005-0000-4000-8000-000000000003','5eed0002-0000-4000-8000-000000000001','Hadja Sylla','+224620333333',NULL),
  ('5eed0005-0000-4000-8000-000000000004','5eed0002-0000-4000-8000-000000000001','Mariam Souaré','+224620444444','Vient toujours avec ses propres mèches.'),
  ('5eed0005-0000-4000-8000-000000000005','5eed0002-0000-4000-8000-000000000002','Fanta Bangoura','+224620555555',NULL),
  ('5eed0005-0000-4000-8000-000000000006','5eed0002-0000-4000-8000-000000000003','Ousmane Barry','+224620666666',NULL),
  ('5eed0005-0000-4000-8000-000000000007','5eed0002-0000-4000-8000-000000000003','Aissatou Bah','+224620777777',NULL),
  ('5eed0005-0000-4000-8000-000000000008','5eed0002-0000-4000-8000-000000000004','Mamadou Keita','+224620888888','Toyota Corolla 2011, plaque RC 4412.'),
  ('5eed0005-0000-4000-8000-000000000009','5eed0002-0000-4000-8000-000000000004','Sekou Traoré','+224620999999',NULL);

-- One row per appointment. The columns the database derives are written out in
-- full rather than defaulted, because it checks them: an appointment whose
-- block window does not match its own frozen buffers is refused, by design.
INSERT INTO appointments (
    id, provider_id, staff_id, service_offering_id, customer_id,
    starts_at, ends_at, buffer_before_minutes, buffer_after_minutes,
    blocked_from, blocked_until, status,
    service_name, customer_price_amount_minor, customer_price_currency,
    duration_minutes, customer_note, source, public_reference,
    service_location_kind, turnaround_hours, ready_by, ready_at,
    service_locality_id, service_area, service_directions,
    cancellation_reason, cancelled_by, cancelled_at, version)
SELECT
    v.id, o.provider_id, v.staff_id, o.id, v.customer_id,
    v.starts_at, v.starts_at + make_interval(mins => o.duration_minutes),
    o.buffer_before_minutes, o.buffer_after_minutes,
    v.starts_at - make_interval(mins => o.buffer_before_minutes),
    v.starts_at + make_interval(mins => o.duration_minutes + o.buffer_after_minutes),
    v.status,
    o.name, o.price_amount_minor, o.price_currency, o.duration_minutes,
    v.note, 'PUBLIC', v.reference,
    o.location_kind, o.turnaround_hours,
    CASE WHEN o.turnaround_hours IS NOT NULL
         THEN v.starts_at + make_interval(hours => o.turnaround_hours) END,
    v.ready_at,
    -- Where the visit is going. The schema demands directions on every
    -- at-customer appointment and refuses them on any other, so this is a CASE
    -- and not a column: one of the fifteen rows below is a call-out.
    CASE WHEN o.location_kind = 'AT_CUSTOMER'
         THEN (SELECT id FROM localities WHERE slug = 'ratoma') END,
    CASE WHEN o.location_kind = 'AT_CUSTOMER' THEN 'Nongo' END,
    CASE WHEN o.location_kind = 'AT_CUSTOMER'
         THEN 'Route Le Prince, portail vert après la boulangerie' END,
    -- The schema refuses a cancelled row that does not say when and by whom,
    -- which is exactly why one is seeded: the state is only worth having if it
    -- is shaped the way the product will shape it.
    CASE WHEN v.status = 'CANCELLED' THEN 'Le client a prévenu la veille.' END,
    CASE WHEN v.status = 'CANCELLED' THEN 'CUSTOMER' END,
    CASE WHEN v.status = 'CANCELLED' THEN now() - interval '1 day' END,
    1
FROM (VALUES
  -- Salon Fatou, Fatoumata: today, so the diary opens on something.
  ('5eed0006-0000-4000-8000-000000000001'::uuid,'5eed0004-0000-4000-8000-000000000002'::uuid,'5eed0003-0000-4000-8000-000000000001'::uuid,'5eed0005-0000-4000-8000-000000000001'::uuid, date_trunc('day', now()) + interval '9 hours',  'CONFIRMED','Je viens avec ma fille.', 'SEED-JZ75KA5V', NULL::timestamptz),
  ('5eed0006-0000-4000-8000-000000000002'::uuid,'5eed0004-0000-4000-8000-000000000003'::uuid,'5eed0003-0000-4000-8000-000000000001'::uuid,'5eed0005-0000-4000-8000-000000000002'::uuid, date_trunc('day', now()) + interval '11 hours', 'PENDING',  NULL,                      'SEED-AUYAZ9V8', NULL),
  ('5eed0006-0000-4000-8000-000000000003'::uuid,'5eed0004-0000-4000-8000-000000000001'::uuid,'5eed0003-0000-4000-8000-000000000001'::uuid,'5eed0005-0000-4000-8000-000000000003'::uuid, date_trunc('day', now()) + interval '14 hours', 'CONFIRMED',NULL,                      'SEED-KM31PQ7T', NULL),
  -- Aminata, the colleague, same day: two chairs busy at once is what the
  -- exclusion constraint is for, and what the day view has to lay out.
  ('5eed0006-0000-4000-8000-000000000004'::uuid,'5eed0004-0000-4000-8000-000000000002'::uuid,'5eed0003-0000-4000-8000-000000000002'::uuid,'5eed0005-0000-4000-8000-000000000004'::uuid, date_trunc('day', now()) + interval '9 hours',  'CONFIRMED',NULL,                      'SEED-QW82LD4R', NULL),
  -- Tomorrow and later this week.
  ('5eed0006-0000-4000-8000-000000000005'::uuid,'5eed0004-0000-4000-8000-000000000001'::uuid,'5eed0003-0000-4000-8000-000000000001'::uuid,'5eed0005-0000-4000-8000-000000000001'::uuid, date_trunc('day', now()) + interval '1 day 10 hours','PENDING', 'Mèches déjà achetées.',  'SEED-TH55VB2N', NULL),
  ('5eed0006-0000-4000-8000-000000000006'::uuid,'5eed0004-0000-4000-8000-000000000003'::uuid,'5eed0003-0000-4000-8000-000000000002'::uuid,'5eed0005-0000-4000-8000-000000000002'::uuid, date_trunc('day', now()) + interval '2 days 15 hours','CONFIRMED',NULL,                   'SEED-BN91XC6M', NULL),
  -- Last week, so the history of a customer is not empty and the completed and
  -- absent states both exist somewhere.
  ('5eed0006-0000-4000-8000-000000000007'::uuid,'5eed0004-0000-4000-8000-000000000002'::uuid,'5eed0003-0000-4000-8000-000000000001'::uuid,'5eed0005-0000-4000-8000-000000000001'::uuid, date_trunc('day', now()) - interval '7 days' + interval '10 hours','COMPLETED',NULL,          'SEED-RD40ZK8W', NULL),
  ('5eed0006-0000-4000-8000-000000000008'::uuid,'5eed0004-0000-4000-8000-000000000003'::uuid,'5eed0003-0000-4000-8000-000000000001'::uuid,'5eed0005-0000-4000-8000-000000000004'::uuid, date_trunc('day', now()) - interval '5 days' + interval '16 hours','NO_SHOW',  NULL,          'SEED-LP17YG3S', NULL),
  ('5eed0006-0000-4000-8000-000000000009'::uuid,'5eed0004-0000-4000-8000-000000000001'::uuid,'5eed0003-0000-4000-8000-000000000002'::uuid,'5eed0005-0000-4000-8000-000000000003'::uuid, date_trunc('day', now()) - interval '3 days' + interval '9 hours', 'COMPLETED',NULL,          'SEED-VC63HN9J', NULL),
  -- Tresses Néné.
  ('5eed0006-0000-4000-8000-00000000000a'::uuid,'5eed0004-0000-4000-8000-000000000005'::uuid,'5eed0003-0000-4000-8000-000000000003'::uuid,'5eed0005-0000-4000-8000-000000000005'::uuid, date_trunc('day', now()) + interval '1 day 9 hours','CONFIRMED',NULL,                     'SEED-GF28MW5D', NULL),
  -- Atelier Mariama: two drop-offs, one still promised and one already ready,
  -- which is the only pair that makes the drop-off queue mean anything.
  ('5eed0006-0000-4000-8000-00000000000b'::uuid,'5eed0004-0000-4000-8000-000000000009'::uuid,'5eed0003-0000-4000-8000-000000000004'::uuid,'5eed0005-0000-4000-8000-000000000006'::uuid, date_trunc('day', now()) - interval '1 day' + interval '11 hours','CONFIRMED','Ourlet à 3 cm.',   'SEED-XS94TR1K', NULL),
  ('5eed0006-0000-4000-8000-00000000000c'::uuid,'5eed0004-0000-4000-8000-000000000008'::uuid,'5eed0003-0000-4000-8000-000000000004'::uuid,'5eed0005-0000-4000-8000-000000000007'::uuid, date_trunc('day', now()) - interval '4 days' + interval '10 hours','CONFIRMED',NULL,             'SEED-DW71QB6L', date_trunc('day', now()) - interval '1 day' + interval '17 hours'),
  -- Garage Camara, including one at the customer's address.
  ('5eed0006-0000-4000-8000-00000000000d'::uuid,'5eed0004-0000-4000-8000-00000000000b'::uuid,'5eed0003-0000-4000-8000-000000000005'::uuid,'5eed0005-0000-4000-8000-000000000008'::uuid, date_trunc('day', now()) + interval '8 hours','CONFIRMED','Bruit au freinage.',        'SEED-ZK52NP8V', NULL),
  ('5eed0006-0000-4000-8000-00000000000e'::uuid,'5eed0004-0000-4000-8000-00000000000d'::uuid,'5eed0003-0000-4000-8000-000000000006'::uuid,'5eed0005-0000-4000-8000-000000000009'::uuid, date_trunc('day', now()) + interval '1 day 14 hours','PENDING','La voiture ne démarre pas.','SEED-HJ36CF4X', NULL),
  -- One cancelled, so the state exists and the slot is provably released.
  ('5eed0006-0000-4000-8000-00000000000f'::uuid,'5eed0004-0000-4000-8000-00000000000b'::uuid,'5eed0003-0000-4000-8000-000000000005'::uuid,'5eed0005-0000-4000-8000-000000000008'::uuid, date_trunc('day', now()) + interval '3 days 9 hours','CANCELLED',NULL,                    'SEED-PM80SD2G', NULL)
) AS v(id, service_offering_id, staff_id, customer_id, starts_at, status, note, reference, ready_at)
JOIN service_offerings o ON o.id = v.service_offering_id;

COMMIT;
