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
docker compose exec -T postgres bash -lc '
  BALAACA_DB_APP_USER="$BALAACA_DB_APP_USER" \
  BALAACA_DB_APP_PASSWORD="$BALAACA_DB_APP_PASSWORD" \
  BALAACA_DB_MIGRATOR_USER="$BALAACA_DB_MIGRATOR_USER" \
  BALAACA_DB_MIGRATOR_PASSWORD="$BALAACA_DB_MIGRATOR_PASSWORD" \
  BALAACA_DB_WORKER_USER="$BALAACA_DB_WORKER_USER" \
  BALAACA_DB_WORKER_PASSWORD="$BALAACA_DB_WORKER_PASSWORD" \
  KEYCLOAK_DB_USER="$KEYCLOAK_DB_USER" \
  KEYCLOAK_DB_PASSWORD="$KEYCLOAK_DB_PASSWORD" \
  KEYCLOAK_DB="$KEYCLOAK_DB" \
  POSTGRES_USER="$POSTGRES_USER" POSTGRES_DB="$POSTGRES_DB" \
  bash /docker-entrypoint-initdb.d/bootstrap.sh'
```

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
4. `infrastructure/keycloak/smoke.sh` — verifie qu'un vrai jeton porte un `sub`,
   la bonne audience et les scopes attendus. Un realm qui demarre n'est pas un
   realm qui fonctionne.

## Ce qui n'existe pas encore

Enonce ici plutot que decouvert un dimanche :

- **aucun pipeline de deploiement.** La CI construit, teste et verifie le
  contrat ; rien ne pousse quoi que ce soit sur le VPS. Le deploiement est
  manuel.
- **aucune sauvegarde documentee.** Il n'y a ni `pg_dump` planifie, ni
  restauration testee.
- **aucune alerte** sur les notifications passees en `DEAD`. Un message qui
  meurt meurt en silence, alors que la doctrine outbox exige le contraire.
