# Architecture decisions

An ADR records **one** structural decision, its context and its consequences.
It is never rewritten: a decision that changes gets a new ADR that supersedes
the old one, and the old one moves to status `Superseded by ADR-XXXX`.

Format: Context, Decision, Consequences, Revisit when.
Naming: `NNNN-title-in-kebab-case.md`, continuous numbering.

| # | Decision | Status |
|---|---|---|
| [0001](0001-hexagonal-modular-monolith.md) | A hexagonal modular monolith rather than microservices | Accepted |
| [0002](0002-tenant-resolved-in-the-database.md) | The tenant is resolved in the database, not from a JWT claim | Accepted, amended |
| [0003](0003-postgresql-exclusion-against-double-booking.md) | A PostgreSQL exclusion constraint against double booking | Accepted, amended |
| [0004](0004-outbox-table-without-a-broker.md) | An outbox table drained by a worker, with no broker | Accepted |
| [0005](0005-scope-of-payment.md) | No payment built now, the seams prepared | Accepted |
| [0006](0006-branch-model.md) | `main` + `develop` + feature branches | Accepted |
| [0007](0007-modelling-time.md) | Instants in UTC, recurring rules in local time | Accepted |
| [0008](0008-native-sql-without-orm-mapping.md) | Native SQL in the adapters, with no ORM mapping | Accepted |
| [0009](0009-self-service-provider-registration.md) | Self-service registration: creating a tenant before a tenant exists | Accepted |

## Amendment rather than supersession

An ADR is normally never rewritten. ADR 0002 and 0003 are the exception: they
were amended on the very day they were written, after an adversarial review and
before any implementation, while no code depended on them. Each keeps at its top
the record of what was corrected and why. An ADR that code rests on is
superseded, never amended.
