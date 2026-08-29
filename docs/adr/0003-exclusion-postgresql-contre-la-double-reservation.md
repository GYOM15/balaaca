# ADR-0003 — Contrainte d'exclusion PostgreSQL contre la double reservation

Statut : Accepte
Verifie empiriquement sur PostgreSQL 18.6 le 2026-08-29.

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

La garantie est **dans PostgreSQL**, par une contrainte d'exclusion :

```sql
CREATE EXTENSION btree_gist;

ALTER TABLE appointments
    ADD COLUMN blocked_range tstzrange GENERATED ALWAYS AS
        (tstzrange(blocked_from, blocked_to, '[)')) STORED;

ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
    EXCLUDE USING gist (
        provider_id   WITH =,
        staff_id      WITH =,
        blocked_range WITH &&
    ) WHERE (status IN ('PENDING','CONFIRMED'));
```

Quatre choix portent la correction :

**`staff_id` est `NOT NULL`.** Une cle de ressource ecrite
`coalesce(staff_id, provider_id)` serait un bug : une reservation « n'importe
quel employe » ne rentrerait en conflit qu'avec les autres non assignees, jamais
avec un rendez-vous nominatif. Creer un prestataire cree donc une ligne
`provider_staff` de role `OWNER`, et « n'importe qui » est resolu **cote
serveur** en une ressource concrete avant l'insertion.

**C'est `blocked_range` qui s'exclut, pas le creneau visible.** Les tampons
avant et apres la prestation font partie de la plage bloquee ; le rendez-vous
affiche au client reste `starts_at`–`ends_at`.

**Les bornes sont semi-ouvertes `[)`.** Un rendez-vous 10:00–11:00 et un
rendez-vous 11:00–12:00 ne se chevauchent pas.

**Le `WHERE` partiel n'indexe que les statuts actifs.** Annuler libere le
creneau, l'index reste compact, et l'historique n'entrave rien.

Interdits explicites : aucun verrou Redis, aucun verrou consultatif, aucun
`SELECT ... FOR UPDATE` pour l'exclusion de creneau. La violation `23P01` est
traduite en `409` avec un code d'erreur stable, jamais en trace d'exception.

## Verification

Execute sur PostgreSQL 18.6, 19 cas de contrainte plus une course a 10 fils :

| Cas | Attendu | Obtenu |
|---|---|---|
| Meme creneau, meme employe | rejet `23P01` | rejet |
| Chevauchement partiel / englobant | rejet `23P01` | rejet |
| Creneau adjacent 11:00–12:00 | accepte | accepte |
| Meme creneau, autre employe du meme prestataire | accepte | accepte |
| Meme creneau, autre prestataire | accepte | accepte |
| Reservation dont le tampon empiete sur le voisin | rejet `23P01` | rejet |
| Rereservation d'un creneau libere par annulation | accepte | accepte |
| Reference croisee vers la prestation / l'employe / le client d'un autre tenant | rejet `23503` | rejet |
| Segments d'horaires qui se chevauchent le meme jour | rejet `23P01` | rejet |
| Meme cle d'idempotence deux fois | rejet `23505` | rejet |
| **10 transactions simultanees sur le meme creneau** | **1 succes, 9 × `23P01`** | **1 ligne en base, 9 conflits** |

La colonne generee `STORED` compile, ce qui confirme que `tstzrange(timestamptz,
timestamptz, text)` est `IMMUTABLE` — l'hypothese la plus fragile de la
conception.

## Consequences

Positives : la garantie tient quel que soit le chemin de code — API publique,
tableau de bord, back-office, worker, futur chatbot, script SQL de maintenance —
et quel que soit le nombre d'instances backend. Elle fonctionne en isolation
`READ COMMITTED`, sans gestion d'echec de serialisation. Le cout en lecture est
nul.

Negatives : le projet est lie a PostgreSQL, ce qui est deja le cas. Les tests
qui touchent cette contrainte exigent un vrai PostgreSQL — jamais H2 ni un
double en memoire. Le message d'erreur brut nomme la contrainte et ne doit donc
jamais atteindre le client.

**Absence de fuite inter-tenant** : la contrainte est evaluee sur toutes les
lignes, RLS ou non. Elle ne peut pourtant rien reveler d'un autre prestataire,
precisement parce que `provider_id` fait partie de la cle d'egalite : un conflit
entre deux tenants est impossible par construction. Ce raisonnement doit etre
refait a chaque modification de la cle de la contrainte.

## A revisiter quand

Une ressource autre que l'employe devient reservable — une salle, un
equipement, un vehicule. La cle de la contrainte doit alors designer cette
ressource, et l'analyse d'absence de fuite ci-dessus doit etre refaite.
