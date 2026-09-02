# ADR-0008 - Native SQL in the adapters, with no ORM mapping

Status: Accepted
Amends rule 9 of the `backend-naming` skill, which described `@Entity` types the
code never had.

## Context

The skeleton declares `quarkus-hibernate-orm-panache` in every module, and the
persistence adapters are named `*PanacheRepository`. The code itself contains
**no** `@Entity`, **no** JPQL and **no** call to the Panache API. Twelve queries,
all of them `createNativeQuery`, spread over four adapters.

The gap was never decided: it settled in query by query, because every invariant
of the schema is a PostgreSQL feature that a mapping cannot express.

- `EXCLUDE USING gist` on a `tstzrange` (ADR-0003): the constraint that forbids
  double booking does not exist in the JPA vocabulary.
- `INSERT ... ON CONFLICT (...) WHERE ... DO NOTHING`: the arbitration of the
  idempotency key is done by a partial index, not by a `merge()`.
- Row-Level Security and `app_current_provider()` (ADR-0002): the tenant
  predicate is applied by the database. An ORM filter would be a second place to
  forget it.
- `lower(range)` / `upper(range)`: the driver has no mapping for `tstzrange`, and
  the calculator only needs the two bounds.
- `SECURITY DEFINER` functions to resolve the tenant before a tenant exists.

An ORM would simplify none of those five. It would fight all five.

## Decision

**The persistence adapters write native SQL.** There is no `@Entity` type, no
domain/entity `*Mapper`, and the schema comes from Flyway alone
(`quarkus.hibernate-orm.schema-management.strategy=none`).

Hibernate ORM stays a dependency for three things and not one more: providing the
`EntityManager`, taking the Agroal connection on which `TenantGucPoolInterceptor`
sets the tenant GUC, and carrying the JTA transaction boundary.
`quarkus-hibernate-orm-panache` is replaced by `quarkus-hibernate-orm`: the
Panache API was used nowhere.

Two naming consequences, applied in the same change:

- the adapters become `*SqlRepository` / `*SqlResolver`. Rule 8 of
  `backend-naming` asks that an adapter be named after the technology it brings;
  `Panache` named an absent one, which is worse than `*Impl`. `Sql` rather than
  `Jdbc`, because the queries go through the `EntityManager`, and rather than
  `Postgres`, because the whole module targets PostgreSQL only and the precision
  would distinguish nothing;
- rule 9 of `backend-naming` is rewritten: it described `AppointmentEntity` and
  `AppointmentEntityMapper`, which never existed.

The row to domain type conversion happens in the method that reads the row. A
`*SqlRepository` stays the only place that knows a column exists.

## Consequences

Positive: the invariants stay where they are enforceable, in the database, and
the code that calls them names them explicitly. No layer rewrites a query whose
shape is the whole point. An `EXPLAIN` covers what is actually sent. One fewer
extension to start.

Negative, and these are real:

- results arrive as an `Object[]` read by index (`r[3]`), with no help from the
  compiler. A column added in the middle of a `SELECT` silently breaks the
  positional mapping;
- the type returned for a temporal column depends on the driver and its
  configuration, which has already produced a `ClassCastException` fixed by hand
  in `AvailabilitySqlRepository`;
- there is no first-level cache, no lazy loading and no optimistic locking on
  offer. Each has to be written if it becomes necessary;
- the `*IT` suites on Testcontainers become the only proof that the queries are
  correct. A test that replaced PostgreSQL with an in-memory database would prove
  nothing any more (see `backend-tests`).

## Revisit when

A context appears whose rules fit entirely in portable CRUD, with no exclusion
constraint, no RLS and no `ON CONFLICT`: `identity` and `billing` are the
plausible candidates. The ADR would then not be worked around for one table: it
would be superseded by an ADR that explicitly delimits where the mapping applies
and where it does not.
