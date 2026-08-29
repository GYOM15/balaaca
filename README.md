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

## Documentation

| Document | Contenu |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | vue macro, contextes, couches, regles de dependance |
| [docs/DATABASE.md](docs/DATABASE.md) | schema, contraintes, index, RLS, migrations |
| [docs/SECURITY.md](docs/SECURITY.md) | modele de menaces, isolation multi-tenant, OWASP |
| [docs/adr/](docs/adr/) | decisions d'architecture et leurs raisons |

## Licence

Proprietaire. Tous droits reserves.
