# ADR-0008 — SQL natif dans les adaptateurs, sans mapping ORM

Statut : Accepte
Amende la regle 9 du skill `backend-naming`, qui decrivait des types `@Entity`
que le code n'a jamais eus.

## Contexte

Le squelette declare `quarkus-hibernate-orm-panache` dans chaque module, et les
adaptateurs de persistance s'appellent `*PanacheRepository`. Le code, lui, ne
contient **aucun** `@Entity`, **aucun** JPQL et **aucun** appel a l'API Panache.
Douze requetes, toutes en `createNativeQuery`, reparties dans quatre
adaptateurs.

L'ecart n'a jamais ete decide : il s'est installe requete par requete, parce que
chaque invariant du schema est une fonctionnalite PostgreSQL qu'un mapping ne
sait pas exprimer.

- `EXCLUDE USING gist` sur un `tstzrange` (ADR-0003) : la contrainte qui interdit
  la double reservation n'existe pas dans le vocabulaire JPA.
- `INSERT ... ON CONFLICT (...) WHERE ... DO NOTHING` : l'arbitrage de la cle
  d'idempotence est fait par un index partiel, pas par un `merge()`.
- Row-Level Security et `app_current_provider()` (ADR-0002) : le predicat de
  tenant est pose par la base. Un filtre ORM serait un second endroit ou
  l'oublier.
- `lower(range)` / `upper(range)` : le pilote n'a pas de mapping pour
  `tstzrange`, et le calculateur n'a besoin que des deux bornes.
- Fonctions `SECURITY DEFINER` pour resoudre le tenant avant qu'un tenant existe.

Un ORM ne simplifierait aucun de ces cinq points. Il se battrait contre les cinq.

## Decision

**Les adaptateurs de persistance ecrivent du SQL natif.** Il n'y a pas de type
`@Entity`, pas de `*Mapper` domaine/entite, et le schema vient de Flyway seul
(`quarkus.hibernate-orm.schema-management.strategy=none`).

Hibernate ORM reste une dependance, pour trois choses et pas une de plus :
fournir l'`EntityManager`, prendre la connexion Agroal — sur laquelle
`TenantGucPoolInterceptor` pose le GUC de tenant — et porter la frontiere
transactionnelle JTA. `quarkus-hibernate-orm-panache` est remplace par
`quarkus-hibernate-orm` : l'API Panache n'etait utilisee nulle part.

Deux consequences de nommage, appliquees dans le meme changement :

- les adaptateurs deviennent `*SqlRepository` / `*SqlResolver`. La regle 8 de
  `backend-naming` demande de nommer un adaptateur d'apres la technologie qu'il
  apporte ; `Panache` en nommait une absente, ce qui est pire que `*Impl`.
  `Sql` plutot que `Jdbc`, parce que les requetes passent par l'`EntityManager`,
  et plutot que `Postgres`, parce que le module entier ne vise que PostgreSQL et
  que la precision ne distinguerait rien ;
- la regle 9 de `backend-naming` est reecrite : elle decrivait
  `AppointmentEntity` et `AppointmentEntityMapper`, qui n'ont jamais existe.

La conversion ligne vers type du domaine se fait dans la methode qui lit la
ligne. Un `*SqlRepository` reste le seul endroit qui sait qu'une colonne existe.

## Consequences

Positives : les invariants restent la ou ils sont verifiables — dans la base —
et le code qui les appelle les nomme explicitement. Aucune couche ne reecrit une
requete dont la forme est le point. Un `EXPLAIN` porte sur ce qui est reellement
envoye. Une extension de moins a demarrer.

Negatives, et elles sont reelles :

- les resultats arrivent en `Object[]` lu par index (`r[3]`), sans aide du
  compilateur. Une colonne ajoutee au milieu d'un `SELECT` casse silencieusement
  le mapping positionnel ;
- le type retourne pour une colonne temporelle depend du pilote et de sa
  configuration, ce qui a deja produit un `ClassCastException` corrige a la main
  dans `AvailabilitySqlRepository` ;
- il n'y a ni cache de premier niveau, ni chargement paresseux, ni verrouillage
  optimiste offert. Chacun devra etre ecrit s'il devient necessaire ;
- les suites `*IT` sur Testcontainers deviennent la seule preuve que les
  requetes sont correctes. Un test qui remplacerait PostgreSQL par une base en
  memoire ne prouverait plus rien (voir `backend-tests`).

## A revisiter quand

Un contexte apparait dont les regles tiennent entierement dans du CRUD portable,
sans contrainte d'exclusion, sans RLS et sans `ON CONFLICT` — `identity` ou
`billing` sont les candidats plausibles. L'ADR ne serait alors pas contourne
pour une table : il serait remplace par un ADR qui delimite explicitement ou le
mapping s'applique et ou il ne s'applique pas.
