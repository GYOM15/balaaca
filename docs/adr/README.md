# Decisions d'architecture

Un ADR enregistre **une** decision structurante, son contexte et ses
consequences. Il n'est jamais reecrit : une decision qui change donne un nouvel
ADR qui remplace l'ancien, et l'ancien passe en statut `Remplace par ADR-XXXX`.

Format : Contexte, Decision, Consequences, A revisiter quand.
Nommage : `NNNN-titre-en-kebab-case.md`, numerotation continue.

| # | Decision | Statut |
|---|---|---|
| [0001](0001-monolithe-modulaire-hexagonal.md) | Monolithe modulaire hexagonal plutot que microservices | Accepte |
| [0002](0002-resolution-du-tenant-en-base.md) | Le tenant est resolu en base, pas depuis un claim JWT | Accepte, amende |
| [0003](0003-exclusion-postgresql-contre-la-double-reservation.md) | Contrainte d'exclusion PostgreSQL contre la double reservation | Accepte, amende |
| [0004](0004-outbox-en-table-sans-broker.md) | Outbox en table drainee par un worker, sans broker | Accepte |
| [0005](0005-perimetre-du-paiement.md) | Aucun paiement construit maintenant, coutures preparees | Accepte |
| [0006](0006-modele-de-branches.md) | `main` + `develop` + branches de feature | Accepte |
| [0007](0007-modelisation-du-temps.md) | Instants en UTC, regles recurrentes en heure locale | Accepte |
| [0008](0008-sql-natif-sans-mapping-orm.md) | SQL natif dans les adaptateurs, sans mapping ORM | Accepte |
| [0009](0009-inscription-autonome-d-un-prestataire.md) | Inscription autonome : creer un tenant avant qu'un tenant existe | Accepte |

## Amendement plutot que remplacement

Un ADR n'est normalement jamais reecrit. Les ADR 0002 et 0003 font exception :
ils ont ete amendes le jour meme de leur redaction, apres une revue
adversariale et avant toute implementation, alors qu'aucun code n'en dependait.
Chacun conserve en tete la trace de ce qui a ete corrige et pourquoi. Un ADR
sur lequel du code repose est remplace, jamais amende.
