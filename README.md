# Balaaca

Hub de prestataires de services. Un prestataire publie sa page, ses prestations et ses
disponibilites ; un client le trouve, reserve, et recoit ses rappels.

Le nom vient du kissi *balaa* (travail, activite) et de *ca* pour Africa.

> Statut : en construction. Ce README decrit ce qui existe reellement dans le depot,
> pas ce qui est prevu. La cible fonctionnelle complete est dans [docs/](docs/).

## Ce que c'est

Le rendez-vous est une capacite du produit, pas son domaine. Le domaine est le
prestataire : sa presence en ligne, son catalogue, son agenda, sa relation client, et
a terme son abonnement a la plateforme.

Marche de lancement : la Guinee (GNF, `Africa/Conakry`). L'architecture ne suppose
nulle part une devise, un indicatif telephonique ou un fuseau unique.

## Stack

| Couche | Choix |
|---|---|
| Backend | Java 21, Quarkus, monolithe modulaire hexagonal, Maven |
| Base de donnees | PostgreSQL 16, migrations Flyway, Row-Level Security forcee |
| Identite | Keycloak (OIDC) — aucun mot de passe n'est stocke par l'application |
| Cache / limites | Redis (cache, rate limiting, idempotence) |
| Frontend | Next.js (App Router), TypeScript, BFF a cookie httpOnly |
| Asynchrone | `notification-worker`, deployable separe |
| Execution | Docker Compose, images multi-arch (amd64 + arm64) |

## Structure

```
balaaca/
├── backend/              # Quarkus — monolithe modulaire (source de verite metier)
├── frontend/             # Next.js — pages publiques, tableau de bord, back-office
├── notification-worker/  # envoi asynchrone : WhatsApp, SMS, email
├── chatbot-service/      # squelette, appelle l'API metier — jamais la base
├── infrastructure/       # docker, nginx, keycloak, postgres
├── docs/                 # architecture, base de donnees, securite, ADR
└── .claude/skills/       # conventions d'ingenierie appliquees au projet
```

## Demarrage local

Prerequis : Docker avec Compose v2. Rien d'autre n'est requis pour la pile
d'infrastructure.

```bash
cp .env.example .env
docker compose up -d
```

`.env` est gitignore. Les valeurs de `.env.example` sont volontairement
faibles et locales : une fuite ne coute rien. Les secrets de production
viennent du magasin de secrets de l'hote, jamais d'un fichier du depot.

| Service | Hote | Role |
|---|---|---|
| PostgreSQL 18.6 | `127.0.0.1:55432` | source de verite, RLS force |
| Redis 8.2 | `127.0.0.1:56379` | cache, rate limiting, idempotence |
| Keycloak 26.4 | `http://localhost:8180` | fournisseur d'identite |

Les ports hote ne sont pas les ports par defaut : une machine de developpement
fait souvent tourner un PostgreSQL sur 5432, et la collision est silencieuse
jusqu'a l'echec de `compose`. Tout est bind sur `127.0.0.1`, jamais expose sur
le reseau.

### Roles PostgreSQL

`infrastructure/postgres/bootstrap.sh` s'execute une seule fois, a
l'initialisation du volume, et cree quatre roles de moindre privilege :

| Role | Usage | Attributs |
|---|---|---|
| `balaaca_migrator` | proprietaire du schema, execute Flyway | jamais utilise a l'execution |
| `balaaca_app` | la connexion applicative | ni proprietaire, ni `BYPASSRLS` — sinon le RLS serait inerte |
| `balaaca_resolver` | proprietaire des fonctions `SECURITY DEFINER` de resolution de tenant | `NOLOGIN` : jamais connecte, seulement incarne |
| `balaaca_notification_worker` | le worker de notifications | restreint a sa table |

Sur un VPS, l'initialisation du conteneur ne s'execute pas contre un cluster
existant : ce script doit etre joue une fois a la main. Voir
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Arret

```bash
docker compose down        # conserve les donnees
docker compose down -v     # supprime aussi le volume PostgreSQL
```

## Developpement

Les hooks Git sont versionnes dans `.githooks/`. Ils ne sont pas actifs tant que
vous ne les avez pas branches, une fois par clone :

```bash
git config core.hooksPath .githooks
```

| Hook | Role |
|---|---|
| `commit-msg` | applique la convention de commit : sujet imperatif capitalise de 50 caracteres maximum, sans prefixe `type(scope):`, corps a 72, aucun trailer `Co-Authored-By` |
| `pre-push` | bloque les pushs directs sur `main` et sur `develop` : les deux n'avancent que par une pull request fusionnee. Overrides explicites : `ALLOW_MAIN_PUSH=1` pour promouvoir `develop` vers `main` a un jalon, `ALLOW_DEVELOP_PUSH=1` pour reparer un `develop` casse |
| `pre-commit` | passe `gitleaks` sur le diff indexe si l'outil est installe |

Ce sont des pre-filtres, pas des garanties : `--no-verify` les contourne. La
verification qui fait autorite est la CI.

Branches : `main` est la branche de release, `develop` la branche d'integration
et la branche par defaut. On travaille sur `feature/<slug>` (ou `fix/`, `chore/`,
`docs/`, `ci/`) coupee depuis `develop`, fusionnee dans `develop` par pull
request. `develop` est promue vers `main` aux jalons de phase.

## Documentation

| Document | Contenu |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | vue macro, contextes, couches, regles de dependance |
| [docs/DATABASE.md](docs/DATABASE.md) | schema, contraintes, index, RLS, migrations |
| [docs/SECURITY.md](docs/SECURITY.md) | modele de menaces, isolation multi-tenant, OWASP |
| [docs/adr/](docs/adr/) | decisions d'architecture et leurs raisons |

## Licence

Proprietaire. Tous droits reserves.
