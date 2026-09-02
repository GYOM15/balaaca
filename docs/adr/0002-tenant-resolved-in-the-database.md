# ADR-0002 - The tenant is resolved in the database, not from a JWT claim

Status: Accepted
Supersedes rule 3 of the inherited `multi-tenant-rls` skill.
Amended on 2026-08-29 after an adversarial review, before any implementation.
The first version prescribed a Redis cache and did not say how the PostgreSQL
GUC was set. Both were real defects; they are corrected below and the reason for
the correction is kept.

## Context

Balaaca's tenant is the **provider**. The convention pack inherited from another
project required reading the tenant from a `tenant_id` claim of the verified
JWT.

Three problems specific to Balaaca:

1. A provider **creates their tenant after signing up**. At the first login no
   claim can exist. It would take a token refresh cycle right after the provider
   is created.
2. Removing a staff member from a team would only take effect when their token
   expired, not immediately.
3. Keycloak would become a **second source of truth** about tenant membership,
   to be kept in sync with `provider_staff`. Any drift between the two is either
   a hole or a lockout.

## Decision

A clean split of the sources of truth:

- The **JWT** is authoritative on **identity** (`sub`) and on **global roles**.
- The **database** is authoritative on **tenant membership**.

Resolution, performed by `TenantBoundInterceptor`:

```
verified sub -> users.keycloak_user_id -> users.id
             -> provider_staff.user_id -> provider_id
```

Fail closed: no resolvable membership, no access
(`NoProviderMembershipException`).

`provider_id` is **never** a method, DTO, request, path or header parameter. It
is ambient, read from `TenantContext`.

### Correction 1 - no cache on the authorisation path

The first version prescribed a short-TTL Redis cache with explicit invalidation
on a membership change. That was a mistake, and it cancelled the very
justification of this ADR.

A positive cache of N minutes **is** a token of N minutes. Invalidation is a
double write across two failure domains: if the transaction that deletes the
`provider_staff` row commits and the Redis eviction fails - a restart, a network
cut, an exception between the two, a second instance - a revoked staff member
keeps full access until the TTL expires, with no recovery and no compensation.
The "revocation must be immediate" argument used above to rule out the JWT claim
was therefore false in our own implementation.

**No cache on the authorisation path.** The resolution is an indexed join over
primary key paths; at this product's volume, caching it buys a microsecond and
costs a hole. If the cost ever becomes measurable, the safe shape is to cache a
`(provider_id, membership_epoch)` pair and validate the epoch on every request,
not to cache the decision itself.

### Correction 2 - the GUC is set by a connection hook

The first version did not say **when** `app.provider_id` was set. The obvious
answer, an interceptor, does not work: `TenantBoundInterceptor` runs at
`PLATFORM_BEFORE + 10`, so **outside** the transaction Quarkus opens at
`PLATFORM_BEFORE + 200`. It cannot call a binder marked `MANDATORY`. Followed to
the letter, the first version produced an application in which **every tenant
request failed**.

The GUC is set by a **connection-level hook**, an Agroal listener or a Hibernate
integrator, which issues, as the first statement on the connection enlisted in
each transaction:

```sql
SELECT set_config('app.provider_id', ?, true)
```

A connection hook, unlike an annotation, also covers any transaction opened
without `@TenantBound`, so an oversight cannot open access.

### Correction 3 - the RLS predicate must degrade cleanly

Verified on PostgreSQL 18.6: `current_setting('app.provider_id')` without
`missing_ok` raises `42704` when the GUC is absent, and `''::uuid` raises
`22P02`. Both produce a 500 instead of a clean 404. Every policy is therefore
written as:

```sql
provider_id = nullif(current_setting('app.provider_id', true), '')::uuid
```

which is `NULL` when the GUC is absent and then filters out every row.

### An accepted limit - one active membership per account

`provider_staff` is a many-to-many relation by its shape. The resolver must not
silently assume uniqueness: uniqueness is **enforced**.

```sql
CREATE UNIQUE INDEX provider_staff_one_active_membership
    ON provider_staff (user_id)
    WHERE user_id IS NOT NULL AND status = 'ACTIVE';
```

Consequence: a person cannot yet be staff at two providers. That is a real
limitation, a hairdresser who works in two salons, accepted at launch and
documented rather than discovered in production.

The future mechanism is named now so that it is not improvised later: one active
membership **selected on the server**, revalidated against `provider_staff` on
every request and held against the BFF session. Never a provider identifier
supplied by the client. It is not built today.

## Consequences

Positive: a single source of truth. Revocation genuinely immediate, this time.
No Keycloak provisioning when a provider is created. The first login works with
no special case. A missing annotation closes access instead of opening it.

Negative: one indexed join per request, uncached and accepted as such. The
connection hook is a single point whose failure must be loud, not silent:
without the GUC every read returns zero rows, which a dedicated test has to
cover.

## Revisit when

The cost of the resolution becomes measurable under real load, or a person
legitimately has to work at several providers.
