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
| `pre-push` | bloque les pushs directs sur `main` et sur `develop`. Sans override : GitHub les refuse de toute facon cote serveur, le hook ne fait que l'annoncer plus tot |
| `pre-commit` | passe `gitleaks` sur le diff indexe **si** l'outil est installe, et se tait sinon. L'installer n'est pas un prerequis : le scan qui fait autorite tourne en CI, sur l'historique complet, a chaque pull request |

Ce sont des pre-filtres, pas des garanties : `--no-verify` les contourne. La
verification qui fait autorite est la CI, qui rejoue tout cote serveur.

## Integration continue

`.github/workflows/ci.yml` s'execute sur chaque pull request vers `develop` ou
`main`, et sur chaque push vers ces deux branches. La chaine echoue vite : un
job ne demarre pas si le precedent est rouge.

| Job | Verifie |
|---|---|
| `secrets` | `gitleaks` sur l'**historique complet** — un secret retire dans un commit ulterieur reste compromis |
| `lint` | `shellcheck` sur les hooks et le bootstrap ; validite du `docker-compose.yml` ; **toute variable referencee par compose est presente dans `.env.example`** ; et le hook `commit-msg` applique toujours la convention |
| `dependencies` | OSV-Scanner, sans cle d'API |

Chaque action est epinglee a un SHA de commit, jamais a un tag : un tag est
mutable et son proprietaire peut le repointer silencieusement. L'archive
`gitleaks` est verifiee par empreinte SHA-256 avant d'etre executee.

Les jobs de build Maven, de tests, de couverture, de mutation et d'image
arriveront avec le code qu'ils verifient. Un job qui ne peut pas echouer n'est
pas une barriere, et le laisser en place ferait paraitre la CI plus verte
qu'elle ne l'est.

Branches : `main` est la branche de release, `develop` la branche d'integration
et la branche par defaut. On travaille sur `feature/<slug>` (ou `fix/`, `chore/`,
`docs/`, `ci/`) coupee depuis `develop`, fusionnee dans `develop` par pull
request. `develop` est promue vers `main` aux jalons de phase, **par pull
request egalement**.

Les deux branches sont protegees cote serveur : pull request obligatoire, les
trois checks de CI exiges, force-push et suppression refuses, et
`enforce_admins` actif — le proprietaire du depot y est soumis comme tout le
monde. Un push direct est rejete avec `GH006`, meme avec `--no-verify`.

## Documentation

| Document | Contenu |
|---|---|
| [docs/adr/](docs/adr/) | les decisions structurantes et leurs raisons |
| [.claude/skills/CANONICAL.md](.claude/skills/CANONICAL.md) | les symboles epingles : tables, ports, exceptions, codes d'erreur, ordre des migrations, et les comportements PostgreSQL verifies |
| [.claude/skills/](.claude/skills/) | les conventions d'ingenierie appliquees au projet |
| [docs/adr/](docs/adr/) | decisions d'architecture et leurs raisons |

## Licence

Proprietaire. Tous droits reserves.
