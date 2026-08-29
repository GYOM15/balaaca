# ADR-0003 — Contrainte d'exclusion PostgreSQL contre la double reservation

Statut : Accepte
Verifie empiriquement sur PostgreSQL 18.6 le 2026-08-29.
Amende le meme jour apres revue adversariale, avant toute implementation. La
version initiale etait insuffisante sur trois points, tous verifies et corriges
ci-dessous.

## Contexte

Deux clients ne doivent jamais obtenir le meme creneau. C'est l'invariant le
plus critique du produit : le violer detruit la confiance du prestataire, et
aucune compensation ne repare un client qui se presente pour rien.

Les protections envisageables etaient : une verification applicative avant
insertion (inoperante — deux requetes concurrentes la passent toutes les deux),
un verrou Redis (Redlock n'est pas un algorithme de verrou sur), un
`SELECT ... FOR UPDATE` sur une ligne de creneau (impose de materialiser tous
les creneaux), ou une contrainte de base.

## Decision

La garantie est **dans PostgreSQL**, par une contrainte d'exclusion. Le DDL
ci-dessous est celui qui a ete execute et teste, pas une intention.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- sinon "uuid =" n'a pas d'opclass GiST

CREATE TABLE appointments (
    id                  uuid PRIMARY KEY,
    provider_id         uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    staff_id            uuid NOT NULL,
    service_offering_id uuid NOT NULL,
    customer_id         uuid NOT NULL,

    starts_at    timestamptz NOT NULL,
    ends_at      timestamptz NOT NULL,
    -- Figes a la reservation : une modification ulterieure de la prestation ne
    -- deplace jamais ce qu'un rendez-vous existant bloque.
    buffer_before_minutes int NOT NULL CHECK (buffer_before_minutes >= 0),
    buffer_after_minutes  int NOT NULL CHECK (buffer_after_minutes  >= 0),
    blocked_from  timestamptz NOT NULL,
    blocked_until timestamptz NOT NULL,

    status  varchar(20) NOT NULL DEFAULT 'PENDING'
            CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')),
    version bigint NOT NULL DEFAULT 0,

    blocked_range tstzrange GENERATED ALWAYS AS
        (tstzrange(blocked_from, blocked_until, '[)')) STORED,

    CONSTRAINT ck_appointments_window         CHECK (ends_at > starts_at),
    CONSTRAINT ck_appointments_block_nonempty CHECK (blocked_until > blocked_from),
    CONSTRAINT ck_appointments_block_covers   CHECK (blocked_from  <= starts_at
                                                 AND blocked_until >= ends_at),
    CONSTRAINT ck_appointments_block_derived  CHECK (
        blocked_from  = starts_at - make_interval(mins => buffer_before_minutes)
    AND blocked_until = ends_at   + make_interval(mins => buffer_after_minutes)),

    FOREIGN KEY (provider_id, staff_id)            REFERENCES provider_staff    (provider_id, id),
    FOREIGN KEY (provider_id, service_offering_id) REFERENCES service_offerings (provider_id, id),
    FOREIGN KEY (provider_id, customer_id)         REFERENCES customers         (provider_id, id),
    CONSTRAINT uq_appointments_tenant UNIQUE (provider_id, id));

ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
    EXCLUDE USING gist (provider_id WITH =, staff_id WITH =, blocked_range WITH &&)
    WHERE (status IN ('PENDING','CONFIRMED'));
```

Choix qui portent la correction :

**`staff_id` est `NOT NULL`.** Une cle de ressource ecrite
`coalesce(staff_id, provider_id)` serait un bug : une reservation « n'importe
quel employe » ne rentrerait en conflit qu'avec les autres non assignees, jamais
avec un rendez-vous nominatif. Creer un prestataire cree donc une ligne
`provider_staff` de role `OWNER`, et « n'importe qui » est resolu **cote
serveur** en une ressource concrete avant l'insertion.

**C'est `blocked_range` qui s'exclut**, pas le creneau visible. Les tampons font
partie de la plage bloquee ; le client voit `starts_at`–`ends_at`.

**Bornes semi-ouvertes `[)`** : 10:00–11:00 et 11:00–12:00 ne se chevauchent pas.

**`WHERE` partiel sur les statuts actifs** : annuler libere le creneau, l'index
reste compact, l'historique n'entrave rien.

Interdits : aucun verrou Redis, aucun verrou consultatif, aucun
`SELECT ... FOR UPDATE` pour l'exclusion de creneau. La violation `23P01` est
traduite en `409 SLOT_UNAVAILABLE`, jamais en trace d'exception.

### Correction 1 — la plage vide neutralisait la contrainte

Verifie : avec `blocked_from = blocked_until`, `tstzrange` produit la plage
**vide**, et en PostgreSQL l'operateur `&&` est **faux** contre tout. Un nombre
illimite de rendez-vous s'inserait alors au meme instant, contrainte satisfaite.

Le chemin etait atteignable : une prestation a `duration_minutes = 0`, ou
n'importe quel bug de calcul de creneau. `ck_appointments_block_nonempty` et
`CHECK (duration_minutes > 0)` sur `service_offerings` le ferment. La version
initiale s'en protegeait seulement par transitivite ; la transitivite ne survit
pas a la premiere modification de schema.

### Correction 2 — la plage bloquee doit etre derivable, pas declarative

La faille la plus grave. `blocked_from` et `blocked_until` sont ecrits par
l'application : rien ne les reliait a `starts_at`, `ends_at` ni aux tampons. Un
appelant declarant une plage etroite — `blocked_from = starts_at`,
`blocked_until = starts_at + 1 minute` pour une coupe d'une heure — obtenait un
succes et laissait 59 minutes non protegees. La promesse « la garantie tient
pour tout chemin de code » etait donc fausse : elle ne tenait que contre la
plage que l'ecrivain voulait bien declarer.

`ck_appointments_block_derived` epingle la derivation **dans la base**. Il
s'appuie sur une asymetrie de PostgreSQL, verifiee dans les deux sens :

| Expression | Colonne generee | Contrainte `CHECK` |
|---|---|---|
| `timestamptz - make_interval(...)` | **refusee**, `42P17` (l'expression n'est pas `IMMUTABLE`) | **acceptee** |

C'est precisement pourquoi `blocked_from` et `blocked_until` sont des colonnes
ordinaires calculees par l'application, tandis que seul `blocked_range` est
genere — et pourquoi la derivation peut malgre tout etre imposee par une
`CHECK`.

### Correction 3 — les FK composites exigent un UNIQUE sur la cible

Verifie : sans `UNIQUE (provider_id, id)` sur la table referencee, la migration
echoue avec `42830`. `provider_staff`, `service_offerings`, `customers` et
`appointments` elle-meme le declarent donc.

### Correction 4 — « n'importe quel employe » ne doit pas renvoyer 409

Bug produit, pas bug technique. Le serveur choisit un employe concret — par
exemple le moins charge — avant d'inserer. Sous concurrence, **tous les
concurrents calculent le meme candidat**. Cinq demandes simultanees dans un
salon a cinq fauteuils libres : une reussit, quatre s'entendent dire que le
creneau est pris.

La reponse depend de qui a choisi l'employe :

- **employe nomme par le client** : `23P01` devient `409` immediatement ;
- **employe choisi par le serveur** : `23P01` declenche une reprise de
  l'unite de travail dans une **nouvelle transaction** contre le candidat
  suivant, bornee par le nombre d'employes eligibles. `409` seulement quand
  tous sont pris.

Le test de concurrence initial ne pouvait pas voir ce defaut : il n'utilisait
qu'un seul employe. Un second test est obligatoire — N employes, N demandes
« n'importe qui » simultanees, N succes sur N employes distincts.

### Correction 5 — la justification de la cle d'exclusion etait fausse

La version initiale affirmait que `provider_id` devait figurer dans la cle pour
empecher une comparaison entre tenants. C'est inexact : `staff_id` est un uuid
globalement unique, rattache a son prestataire par une FK composite, donc
`staff_id WITH =` seul ne peut deja pas correspondre a un autre tenant.

`provider_id` reste dans la cle — pour la selectivite de l'index et par defense
en profondeur — mais pour **cette** raison. En revanche l'observation connexe
demeure exacte : la contrainte est evaluee sur toutes les lignes, RLS ou non, et
elle ne peut rien reveler d'un autre prestataire parce qu'un conflit entre
tenants est impossible par construction.

## Verification

Execute sur PostgreSQL 18.6. 19 cas sur le schema initial, puis 7 cas
supplementaires sur le schema corrige :

| Cas | Attendu | Obtenu |
|---|---|---|
| Meme creneau / chevauchement partiel / englobant, meme employe | rejet `23P01` | rejet |
| Creneau adjacent, bornes semi-ouvertes | accepte | accepte |
| Meme creneau, autre employe ou autre prestataire | accepte | accepte |
| Rereservation d'un creneau libere par annulation | accepte | accepte |
| Reference croisee vers une ressource d'un autre tenant | rejet `23503` | rejet |
| Segments d'horaires qui se chevauchent | rejet `23P01` | rejet |
| **10 transactions simultanees sur le meme creneau** | **1 succes, 9 × `23P01`** | **1 ligne, 9 conflits** |
| **Plage bloquee vide** | rejet `23514` | rejet |
| **Plage bloquee frauduleusement retrecie** | rejet `23514` | rejet |
| **`blocked_from` incoherent avec le tampon declare** | rejet `23514` | rejet |
| **Prestation a duree nulle** | rejet `23514` | rejet |
| Creneau chevauchant le tampon d'un voisin | rejet `23P01` | rejet |
| Creneau demarrant exactement a la fin du tampon | accepte | accepte |

## Consequences

Positives : la garantie tient pour tout chemin de code — API publique, tableau
de bord, back-office, worker, futur chatbot, correctif SQL manuel — et pour
n'importe quel nombre d'instances. Elle fonctionne en isolation
`READ COMMITTED`, sans gestion d'echec de serialisation. Cout nul en lecture.

Negatives : le projet est lie a PostgreSQL, ce qui etait deja le cas. Les tests
touchant cette contrainte exigent un vrai PostgreSQL — jamais H2. Le message
d'erreur brut nomme la contrainte et ne doit jamais atteindre le client. La
reprise sur candidat suivant (correction 4) ajoute un chemin dont la
terminaison doit etre bornee et testee.

## A revisiter quand

Une ressource autre que l'employe devient reservable — une salle, un
equipement, un vehicule. La cle de la contrainte doit alors la designer, et
l'analyse d'absence de fuite doit etre refaite.
