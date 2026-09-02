# ADR-0009 - Self-service registration: creating a tenant before a tenant exists

Status: Accepted
Completes ADR-0002, which solved reading the tenant and left the initial write
unanswered.

## Context

ADR-0002 established that the tenant is resolved in the database, from the
token's subject, through `users` and `provider_staff`. It broke the circularity
of the **read** with `app_resolve_provider`, a `SECURITY DEFINER` function.

What remains is that nothing creates those rows. The tenant policy on `providers`
carries `WITH CHECK (id = app_current_provider())`: with no GUC bound, the
predicate is `NULL` and admits no row. The result is a complete and silent dead
end, verified on PostgreSQL 18.6:

1. a salon signs up in Keycloak, self-registration being open;
2. it gets a perfectly valid token;
3. `app_resolve_provider` finds nothing, and **every** authenticated route
   answers 403;
4. no role can run the `INSERT` that would get it out of there.

The whole authenticated surface, the diary, the catalogue, the opening hours,
cancellation, rescheduling, was therefore unreachable by anyone new. That was not
a missing feature but a wall in front of the product.

Three options were weighed.

- **Bootstrap every salon by hand**, by migration or by `psql`. That works for
  ten salons and for no business model.
- **Open an `INSERT` policy to `balaaca_app`.** A policy that admits a
  `provider_staff` row with no bound tenant is a takeover: a freshly registered
  account that knows a `provider_id` adds itself as `OWNER` at a competitor's,
  and the resolver hands it that tenant on the next request. The predicate that
  would prevent it has to read `providers`, which the connection cannot see yet.
- **A `SECURITY DEFINER` function**, as for the read.

## Decision

**One function, `app_register_provider`, writes the three rows in one
transaction, and it belongs to its own role.**

`balaaca_registrar` is distinct from `balaaca_resolver`, which stays read-only.
The question "what can bring a provider into being" then has exactly one answer,
and an audit finds it with one query over function owners. The role is `NOLOGIN`:
its `GRANT INSERT`s are reachable only through this function.

Three points carry the security, and none of them is a matter of style.

1. **The `providers` row is inserted BEFORE the `provider_staff` row.** A caller
   passing an existing provider's identifier fails on `providers_pkey` before any
   membership is written. Reversed, the two inserts make this function the
   takeover that option 2 made possible. Verified.
2. **Two policies constrain the definer itself.** `providers_registration` admits
   only a dormant provider (`PENDING`, unpublished), `provider_staff_registration`
   only an `OWNER` row. No rewrite of the function can therefore publish a page at
   registration.
3. **Uniqueness is translated into a SQLSTATE inside the function.** Every
   uniqueness violation arrives as `23505`; telling three constraints apart in
   Java would need the PostgreSQL driver's exception type in a module that has no
   other reason to depend on it. `providers_slug_key` becomes `Z0001`,
   `uq_provider_staff_one_active_membership` and `users_keycloak_user_id_key`
   become `Z0002`. Everything else is re-raised as is.

`POST /v1/providers` is consequently `@Authenticated` and **not** `@TenantBound`,
the only route on the platform in that position, and it declares no scope: a
scope says what a caller may do *inside their own provider*, and they have none
yet.

Two error codes are added to the closed catalogue, `SLUG_UNAVAILABLE` and
`ALREADY_REGISTERED`. Both are `409` and neither was expressible: a client that
cannot tell them apart cannot tell the salon which of the two it is holding, when
one is fixed by picking another handle and the other is fixed by nothing.

## Consequences

Positive: a salon registers on its own, end to end, with no intervention. The
privileged write boundary is a single named object, constrained by policies, and
its insert order is tested. The account is created from the verified token and
never from a request body, so the name in the audit log is the one the identity
carries.

Negative, and these are real:

- a fifth database role to create on a VPS, and three bootstrap scripts to keep
  in agreement;
- the registration logic lives in plpgsql, out of reach of the compiler and of
  unit tests; only the `*IT` suites on Testcontainers cover it;
- two invented SQLSTATEs (`Z0001`, `Z0002`) are a vocabulary of this project's
  own, documented in the migration and in CANONICAL.md, and invisible everywhere
  else;
- an account can hold a single salon. It is ADR-0002's
  `uq_provider_staff_one_active_membership` index that imposes this, not this
  decision, but this is where the user meets it.

## Revisit when

A person has to hold several salons, or be staff at two providers. The
single-active-membership constraint then falls, the resolver can no longer return
one `uuid`, and registration stops being the only privileged write path: someone
will also have to be invited into an existing provider. That is an ADR that
supersedes this one, not a workaround.
