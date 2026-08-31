-- Curated, exactly as V016 curated the trades, and for the same reason: left as
-- free text, "Ratoma", "ratoma" and "Commune de Ratoma" each match one business,
-- and the hub stops working exactly when it starts having providers.
--
-- SCOPE, decided rather than drifted into.
--
-- Quartiers are seeded for CONAKRY and only for Conakry. That is where the
-- peninsula makes the word "Conakry" meaningless. Upcountry the prefecture is
-- already the discriminating answer - somebody looking for a hairdresser in Labe
-- means Labe - and seeding three hundred rural districts nobody filters on would
-- be inventing work.
--
-- CONAKRY IS SEEDED AS THE LAW LEFT IT, not as the five communes everyone still
-- says. The CNT adopted on 18 January 2024 the creation of ten urban and seven
-- rural communes: Ratoma was split into Ratoma / Lambanyi / Sonfonia, and Matoto
-- into Gbessia / Matoto / Tombolia; Kassa had already become the sixth commune
-- in 2021. The old names survive as ALIASES, never as rows - a provider typing
-- what is on their sign still lands somewhere, and nobody is filed under a
-- commune that no longer exists.

-- Seven of the eight regions carry the name of one of their own prefectures -
-- Boke region contains Boke prefecture, and so on for Labe, Mamou, Faranah,
-- Kankan, Kindia and Nzerekore. The slug is the public filter key and has to be
-- unique, so the PREFECTURE keeps the plain name and the region takes
-- "<name>-region".
--
-- That way round, because a customer typing "Boke" means the town. The region
-- is a container they navigate through, not a place they search for, and a
-- filter on it would return every hairdresser in a quarter of the country.
-- Their labels are unchanged: only the key differs.
INSERT INTO localities (id, parent_id, kind, slug, label_fr, iso_3166_2, aliases, sort_order) VALUES
    ('10ca1000-0000-4000-8000-000000000001', NULL, 'REGION', 'conakry', 'Conakry', 'GN-C', '{conakry}', 10),
    ('10ca1000-0000-4000-8000-000000000002', NULL, 'REGION', 'kindia-region', 'Kindia', 'GN-D', '{kindia region}', 20),
    ('10ca1000-0000-4000-8000-000000000003', NULL, 'REGION', 'boke-region', 'Boke', 'GN-B', '{boke region}', 30),
    ('10ca1000-0000-4000-8000-000000000004', NULL, 'REGION', 'labe-region', 'Labe', 'GN-L', '{labe region}', 40),
    ('10ca1000-0000-4000-8000-000000000005', NULL, 'REGION', 'mamou-region', 'Mamou', 'GN-M', '{mamou region}', 50),
    ('10ca1000-0000-4000-8000-000000000006', NULL, 'REGION', 'faranah-region', 'Faranah', 'GN-F', '{faranah region}', 60),
    ('10ca1000-0000-4000-8000-000000000007', NULL, 'REGION', 'kankan-region', 'Kankan', 'GN-K', '{kankan region}', 70),
    ('10ca1000-0000-4000-8000-000000000008', NULL, 'REGION', 'nzerekore-region', 'Nzerekore', 'GN-N', '{nzerekore region}', 80);

-- The thirty-three prefectures. No ISO code written here: the standard
-- publishes one for each, and guessing thirty-three two-letter codes to fill
-- a column nothing reads yet would be inventing data. They can be added by
-- an UPDATE the day something needs them.
INSERT INTO localities (id, parent_id, kind, slug, label_fr, aliases, sort_order) VALUES
    ('10ca2000-0000-4000-8000-000000000001','10ca1000-0000-4000-8000-000000000003','PREFECTURE','boffa','Boffa','{boffa}',10),
    ('10ca2000-0000-4000-8000-000000000002','10ca1000-0000-4000-8000-000000000003','PREFECTURE','boke','Boke','{boke}',20),
    ('10ca2000-0000-4000-8000-000000000003','10ca1000-0000-4000-8000-000000000003','PREFECTURE','fria','Fria','{fria}',30),
    ('10ca2000-0000-4000-8000-000000000004','10ca1000-0000-4000-8000-000000000003','PREFECTURE','gaoual','Gaoual','{gaoual}',40),
    ('10ca2000-0000-4000-8000-000000000005','10ca1000-0000-4000-8000-000000000003','PREFECTURE','koundara','Koundara','{koundara}',50),
    ('10ca2000-0000-4000-8000-000000000006','10ca1000-0000-4000-8000-000000000006','PREFECTURE','dabola','Dabola','{dabola}',10),
    ('10ca2000-0000-4000-8000-000000000007','10ca1000-0000-4000-8000-000000000006','PREFECTURE','dinguiraye','Dinguiraye','{dinguiraye}',20),
    ('10ca2000-0000-4000-8000-000000000008','10ca1000-0000-4000-8000-000000000006','PREFECTURE','faranah','Faranah','{faranah}',30),
    ('10ca2000-0000-4000-8000-000000000009','10ca1000-0000-4000-8000-000000000006','PREFECTURE','kissidougou','Kissidougou','{kissidougou}',40),
    ('10ca2000-0000-4000-8000-00000000000a','10ca1000-0000-4000-8000-000000000007','PREFECTURE','kankan','Kankan','{kankan}',10),
    ('10ca2000-0000-4000-8000-00000000000b','10ca1000-0000-4000-8000-000000000007','PREFECTURE','kerouane','Kerouane','{kerouane}',20),
    ('10ca2000-0000-4000-8000-00000000000c','10ca1000-0000-4000-8000-000000000007','PREFECTURE','kouroussa','Kouroussa','{kouroussa}',30),
    ('10ca2000-0000-4000-8000-00000000000d','10ca1000-0000-4000-8000-000000000007','PREFECTURE','mandiana','Mandiana','{mandiana}',40),
    ('10ca2000-0000-4000-8000-00000000000e','10ca1000-0000-4000-8000-000000000007','PREFECTURE','siguiri','Siguiri','{siguiri}',50),
    ('10ca2000-0000-4000-8000-00000000000f','10ca1000-0000-4000-8000-000000000002','PREFECTURE','coyah','Coyah','{coyah}',10),
    ('10ca2000-0000-4000-8000-000000000010','10ca1000-0000-4000-8000-000000000002','PREFECTURE','dubreka','Dubreka','{dubreka}',20),
    ('10ca2000-0000-4000-8000-000000000011','10ca1000-0000-4000-8000-000000000002','PREFECTURE','forecariah','Forecariah','{forecariah}',30),
    ('10ca2000-0000-4000-8000-000000000012','10ca1000-0000-4000-8000-000000000002','PREFECTURE','kindia','Kindia','{kindia}',40),
    ('10ca2000-0000-4000-8000-000000000013','10ca1000-0000-4000-8000-000000000002','PREFECTURE','telimele','Telimele','{telimele}',50),
    ('10ca2000-0000-4000-8000-000000000014','10ca1000-0000-4000-8000-000000000004','PREFECTURE','koubia','Koubia','{koubia}',10),
    ('10ca2000-0000-4000-8000-000000000015','10ca1000-0000-4000-8000-000000000004','PREFECTURE','labe','Labe','{labe}',20),
    ('10ca2000-0000-4000-8000-000000000016','10ca1000-0000-4000-8000-000000000004','PREFECTURE','lelouma','Lelouma','{lelouma}',30),
    ('10ca2000-0000-4000-8000-000000000017','10ca1000-0000-4000-8000-000000000004','PREFECTURE','mali','Mali','{mali}',40),
    ('10ca2000-0000-4000-8000-000000000018','10ca1000-0000-4000-8000-000000000004','PREFECTURE','tougue','Tougue','{tougue}',50),
    ('10ca2000-0000-4000-8000-000000000019','10ca1000-0000-4000-8000-000000000005','PREFECTURE','dalaba','Dalaba','{dalaba}',10),
    ('10ca2000-0000-4000-8000-00000000001a','10ca1000-0000-4000-8000-000000000005','PREFECTURE','mamou','Mamou','{mamou}',20),
    ('10ca2000-0000-4000-8000-00000000001b','10ca1000-0000-4000-8000-000000000005','PREFECTURE','pita','Pita','{pita}',30),
    ('10ca2000-0000-4000-8000-00000000001c','10ca1000-0000-4000-8000-000000000008','PREFECTURE','beyla','Beyla','{beyla}',10),
    ('10ca2000-0000-4000-8000-00000000001d','10ca1000-0000-4000-8000-000000000008','PREFECTURE','gueckedou','Gueckedou','{gueckedou}',20),
    ('10ca2000-0000-4000-8000-00000000001e','10ca1000-0000-4000-8000-000000000008','PREFECTURE','lola','Lola','{lola}',30),
    ('10ca2000-0000-4000-8000-00000000001f','10ca1000-0000-4000-8000-000000000008','PREFECTURE','macenta','Macenta','{macenta}',40),
    ('10ca2000-0000-4000-8000-000000000020','10ca1000-0000-4000-8000-000000000008','PREFECTURE','nzerekore','Nzerekore','{nzerekore}',50),
    ('10ca2000-0000-4000-8000-000000000021','10ca1000-0000-4000-8000-000000000008','PREFECTURE','yomou','Yomou','{yomou}',60);
-- Conakry's communes. No prefecture level between them and the region: the
-- special zone's boundaries are the prefecture's, and inventing a "Conakry
-- prefecture" row would add a level no customer ever picks.
INSERT INTO localities (id, parent_id, kind, slug, label_fr, aliases, sort_order) VALUES
    ('10ca3000-0000-4000-8000-000000000001','10ca1000-0000-4000-8000-000000000001','COMMUNE','kaloum','Kaloum','{kaloum,"commune de kaloum"}',10),
    ('10ca3000-0000-4000-8000-000000000002','10ca1000-0000-4000-8000-000000000001','COMMUNE','dixinn','Dixinn','{dixinn,"commune de dixinn"}',20),
    ('10ca3000-0000-4000-8000-000000000003','10ca1000-0000-4000-8000-000000000001','COMMUNE','matam','Matam','{matam,"commune de matam"}',30),
    ('10ca3000-0000-4000-8000-000000000004','10ca1000-0000-4000-8000-000000000001','COMMUNE','ratoma','Ratoma','{ratoma,"commune de ratoma"}',40),
    ('10ca3000-0000-4000-8000-000000000005','10ca1000-0000-4000-8000-000000000001','COMMUNE','lambanyi','Lambanyi','{lambanyi,lambandji}',50),
    ('10ca3000-0000-4000-8000-000000000006','10ca1000-0000-4000-8000-000000000001','COMMUNE','sonfonia','Sonfonia','{sonfonia,"sonfonia gare"}',60),
    ('10ca3000-0000-4000-8000-000000000007','10ca1000-0000-4000-8000-000000000001','COMMUNE','matoto','Matoto','{matoto,"commune de matoto"}',70),
    ('10ca3000-0000-4000-8000-000000000008','10ca1000-0000-4000-8000-000000000001','COMMUNE','gbessia','Gbessia','{gbessia}',80),
    ('10ca3000-0000-4000-8000-000000000009','10ca1000-0000-4000-8000-000000000001','COMMUNE','tombolia','Tombolia','{tombolia}',90),
    ('10ca3000-0000-4000-8000-00000000000a','10ca1000-0000-4000-8000-000000000001','COMMUNE','kassa','Kassa','{kassa,"iles de loos","ile de kassa"}',100);


-- Lambanyi's own list names a quartier "Lambanyi", inside the commune of the
-- same name. It is not seeded, and the reason is not the unique index: a
-- quartier that repeats its commune is not a choice a customer can make. The
-- subtree match already returns everything under the commune, so the row would
-- add a second way to say the same thing and one of the two would be wrong.
-- ---------------------------------------------------------------------------
-- Where this table stops, and why it stops there
-- ---------------------------------------------------------------------------
-- No quartiers. None, anywhere - not the twenty-two of Conakry an earlier draft
-- of this file carried, and not the districts upcountry.
--
-- The reasoning that produced them was V016's, applied where it does not hold.
-- A trade taxonomy is thirty-five rows, genuinely closed, and AUTHORED by the
-- platform: it is a navigation device, and choosing it is the product's job.
-- Guinea's quartiers and districts are thousands of rows the platform does not
-- author and cannot complete, and a curated list of them has one guaranteed
-- property - it is missing the one a provider needs. Somebody registering in
-- Siguiri would be unable to say where they are until a migration reached their
-- neighbourhood.
--
-- So this table holds exactly what IS closed, small and sourced: eight regions,
-- thirty-three prefectures - the whole country - and the ten communes of
-- Conakry, which exist because the peninsula is the one place a prefecture is
-- too coarse to mean anything.
--
-- The quartier lives on the provider, as folded free text, and the values grow
-- from registrations rather than from migrations. See V030.

-- ---------------------------------------------------------------------------
-- Backfill, deliberately partial
-- ---------------------------------------------------------------------------
-- Only an unambiguous hit is adopted, and "Conakry" is not one of them: it names
-- the region, so a business there is placed at region level and asked for a
-- commune at its next edit rather than being guessed into one.
--
-- The 2024 split is the sharper reason. A row saying "Ratoma" may be in today's
-- Ratoma, Lambanyi or Sonfonia, and putting a business on the wrong side of the
-- city is worse than an empty column: a customer filters by their own commune
-- and is shown somebody forty minutes away.
UPDATE providers p
   SET locality_id = l.id
  FROM localities l
 WHERE p.locality_id IS NULL
   AND p.city IS NOT NULL
   AND l.active
   AND lower(btrim(p.city)) = ANY (l.aliases)
   -- A commune name from before the split is ambiguous now. Only the levels
   -- that did not move are adopted.
   AND l.kind IN ('REGION', 'PREFECTURE');
