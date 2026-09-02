# Deploiement

Ce fichier est celui que `infrastructure/postgres/bootstrap.sh` et la migration
`V014` citent nommement. Il n'existait pas, et son absence etait la moitie du
probleme qu'il decrit.

## Le piege, une fois pour toutes

Les roles PostgreSQL ne peuvent pas etre crees par une migration. `balaaca_migrator`
est `NOCREATEROLE`, deliberement : un role qui peut fabriquer des roles peut
fabriquer un role sans RLS. Les roles viennent donc de `bootstrap.sh`, execute en
superutilisateur.

Or ce script est monte dans `/docker-entrypoint-initdb.d`, et l'image PostgreSQL
ne l'execute **que sur un repertoire de donnees vide**. Sur une base qui contient
deja des donnees, il ne tourne jamais.

Consequence : toute migration qui a besoin d'un role nouveau echoue, et avec
`quarkus.flyway.migrate-at-start=true`, **l'application ne demarre pas du tout**.

## La regle

> Avant chaque deploiement, rejouer `bootstrap.sh` en superutilisateur.

Il est idempotent : chaque role est cree seulement s'il est absent, et le mot de
passe d'un role existant n'est jamais reapplique. Le rejouer sur une base a jour
ne fait rien.

```bash
docker compose exec -T postgres bash /docker-entrypoint-initdb.d/bootstrap.sh
```

Les variables dont il a besoin sont deja dans l'environnement du conteneur,
posees par compose. Les **noms** de roles n'en font pas partie : ils sont fixes,
parce que les migrations accordent leurs droits a ces identifiants litteralement.
Une variable qui pretendait les configurer produisait un bootstrap reussi suivi
d'un Flyway qui echoue sur `role "balaaca_app" does not exist` ; elle a ete
supprimee.

Si vous l'oubliez, la migration ne vous laisse pas deviner :

```
ERROR: role balaaca_registrar does not exist
HINT:  This migration adds a role the cluster predates. Re-run
       infrastructure/postgres/bootstrap.sh as superuser - it is idempotent -
       then start the application again. See docs/DEPLOYMENT.md.
```

## Les roles, et pourquoi il y en a cinq

| Role | Ce qu'il peut | Pourquoi separe |
|---|---|---|
| `balaaca_migrator` | proprietaire du schema, execute Flyway | jamais utilise a l'execution |
| `balaaca_app` | la connexion applicative | ni proprietaire ni `BYPASSRLS`, sinon le RLS est inerte |
| `balaaca_resolver` | `NOLOGIN`, proprietaire des fonctions de resolution, **lecture seule** | resoudre un tenant avant qu'un tenant soit lie |
| `balaaca_registrar` | `NOLOGIN`, proprietaire de la seule fonction qui cree un prestataire | « qui peut faire naitre un salon » a une seule reponse |
| `balaaca_notification_worker` | `SELECT`/`UPDATE` sur `notifications`, rien d'autre | un bug de drain ne devient pas une fuite entre tenants |

## Ordre d'un deploiement

1. `git pull` sur la machine cible.
2. **`bootstrap.sh`** (ci-dessus). Toujours, meme si rien ne semble avoir change.
3. Reconstruire et redemarrer : Flyway applique les migrations au demarrage.
4. `infrastructure/keycloak/smoke.sh` - verifie qu'un vrai jeton porte un `sub`,
   la bonne audience et les scopes attendus. Un realm qui demarre n'est pas un
   realm qui fonctionne.

## Les images publiees

Elles vivent dans un repertoire monte, designe par `BALAACA_MEDIA_ROOT`
(defaut `/var/lib/balaaca/media`). C'est honnete plutot qu'ideal, et il vaut
mieux le dire :

- **une seule instance.** Une deuxieme instance ne verrait pas les fichiers de
  la premiere ;
- **rien devant.** L'application sert ses propres octets, ce qui appartient a un
  CDN ;
- **a sauvegarder separement.** Le repertoire ne fait pas partie du dump
  PostgreSQL, et une base restauree sans lui pointe vers des images absentes.

La base stocke un **nom**, jamais une URL, et l'acces passe par un port. Le jour
ou cela devient un stockage objet, c'est un adaptateur qui change - ni le schema,
ni les lignes deja ecrites.

## Ce qui n'existe pas encore

Enonce ici plutot que decouvert un dimanche :

- **aucun pipeline de deploiement.** La CI construit, teste et verifie le
  contrat ; rien ne pousse quoi que ce soit sur le VPS. Le deploiement est
  manuel.
- **aucune sauvegarde documentee.** Il n'y a ni `pg_dump` planifie, ni
  restauration testee.
- **aucune alerte** sur les notifications passees en `DEAD` - au sens d'un
  systeme d'alerte. Le worker journalise desormais chaque mort en `ERROR`, avec
  le `provider_id`, le type et la cle de deduplication (jamais le destinataire),
  ce qui suffit a une recherche mais pas a reveiller quelqu'un :

  ```
  notification.dead id=... provider_id=... kind=BOOKING_CONFIRMATION
                    dedupe_key=... code=... attempts=5
  ```
