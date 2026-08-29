---
name: multi-tenant-rls
description: Keeps one provider's data invisible to another. Use when adding or migrating a table that carries provider_id, writing a repository or service that touches one, enabling or writing an RLS policy, binding the app.provider_id GUC, resolving tenant membership from a Keycloak subject, building an admin route that legitimately crosses providers, or reviewing a PR for a missing tenant filter, a tenant id in a request, a JWT provider claim, or a cached membership lookup.
---

# multi-tenant-rls

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Tenant isolation as defence in depth. The tenant is the **provider**: every
tenant-owned table carries `provider_id uuid NOT NULL`, and PostgreSQL
Row-Level Security is the backstop under the application filter.
`TenantContext` is filled by resolving the verified JWT `sub` against
`provider_staff` **in the database** — never from a claim, a header, or a
method argument. Fail-closed: no resolvable membership, no access.

## When to use

- Adding a table that holds provider-owned data (`appointments`,
  `customers`, `service_offerings`, `availability_rules`, `subscriptions`…).
- Writing a repository, port, or service method that touches such a table.
- Adding a REST resource under `/v1/…`, or wiring the connection-level hook
  that binds the RLS GUC.
- Building an `admin` operation that must legitimately cross providers.
- Reviewing a PR for a missing `WHERE provider_id`, a spoofable tenant
  source, a cached membership lookup, or a table shipped without RLS.

## The rules

1. **The tenant is the provider, and every tenant-scoped table carries
   `provider_id uuid NOT NULL`.** It is a real column, part of the relevant
   unique constraints (a natural key is unique *within* a provider, e.g.
   `UNIQUE (provider_id, phone_e164)` on `customers`), and indexed. No
   provider data lives in a table without it. `providers` itself is the
   tenant root: its own `id` *is* the `provider_id` of everything below it.
2. **Tenant membership is resolved from the database, never from a JWT
   claim.** The chain is
   `verified JWT sub -> users.keycloak_user_id -> users.id ->
   provider_staff.user_id -> provider_staff.provider_id`.
   Three reasons this is not negotiable: a provider creates their tenant
   *after* signing up, so at first login no claim could exist; revoking a
   staff member must take effect on the next request, not at token expiry;
   and membership in Keycloak would be a second source of truth to keep in
   sync with `provider_staff`. The JWT stays the source of truth for
   **identity** (`sub`) and **global roles**; the database is the source of
   truth for **tenant membership**.
3. **There is NO cache on the authorisation path.** A positive
   `subject -> provider_id` cache with a five-minute TTL is a five-minute
   bearer token: delete a `provider_staff` row, miss the eviction — a lost
   Redis round-trip, a crashed pod between the commit and the evict, a
   second application instance — and the revoked staff member keeps full
   access until the entry lapses. That is a dual write across two failure
   domains, and it reintroduces exactly the delayed-revocation defect that
   made a JWT claim unacceptable in rule 2; a design cannot reject claims
   for being slow to revoke and then cache the replacement. The resolution
   is a two-join lookup on primary-key and unique-index paths, once per
   request; at this product's volume the cache buys nothing measurable and
   costs correctness. Do not add Caffeine either — a per-instance cache has
   the same defect and no eviction channel at all.
4. **The membership lookup runs through a `SECURITY DEFINER` function,
   because no tenant is bound yet.** `provider_staff` is itself
   tenant-scoped and under RLS, so the resolver cannot read it as a tenant —
   that is the chicken-and-egg of tenant resolution. Expose exactly one
   locked-down function, owned by the schema owner, with a pinned
   `search_path`, returning nothing but a `provider_id`, and grant
   `EXECUTE` on it to the application role alone. It is the only sanctioned
   pre-tenant read in the system; any second one needs an ADR.
5. **A user has at most ONE active membership, enforced by a unique partial
   index.** `provider_staff` is many-to-many by shape, so the resolver must
   not silently assume a single row and take the first. Ship
   `CREATE UNIQUE INDEX provider_staff_one_active_membership ON
   provider_staff (user_id) WHERE user_id IS NOT NULL AND status = 'ACTIVE';`
   and have the resolver throw `NoProviderMembershipException` on zero rows.
   **Known limitation, stated deliberately:** a person cannot yet be staff
   at two providers. The future mechanism is a server-side *selected
   membership*, revalidated against `provider_staff` on every request and
   held against the BFF session — never a client-supplied provider id, which
   would put the trust boundary back in the caller. Do not build it now.
6. **The RLS GUC is bound by a CONNECTION-level hook, not by a business
   interceptor.** `TenantBoundInterceptor` runs at
   `Interceptor.Priority.PLATFORM_BEFORE + 10`, and Quarkus opens the
   transaction at `PLATFORM_BEFORE + 200` — so the interceptor is *outside*
   the transaction and can never call a `@Transactional(MANDATORY)` binder.
   A binder invoked from there either fails or silently binds nothing, and
   every tenant query then returns zero rows. Bind instead from an Agroal
   pool interceptor (equivalently, a Hibernate session-level integrator)
   that issues
   `SELECT set_config('app.provider_id', ?, true)` as the FIRST statement on
   the connection as it is acquired for the enclosing transaction, reading
   the value from `TenantContext`. `is_local = true` gives `SET LOCAL`
   semantics, so the value dies with the transaction and cannot leak to the
   next borrower of the pooled connection. A connection hook also covers
   transactions opened without `@TenantBound` — the interceptor only
   populates `TenantContext`; the hook is what the database sees.
7. **Every tenant-scoped table has RLS `ENABLE`d and `FORCE`d in a Flyway
   migration, and every policy predicate is written exactly one way:**
   ```sql
   provider_id = nullif(current_setting('app.provider_id', true), '')::uuid
   ```
   `current_setting` without `missing_ok = true` raises `42704` when the GUC
   was never set, and `''::uuid` raises `22P02` — both turn an unbound
   request into a `500` that leaks the mechanism. This form degrades to
   `NULL`, `provider_id = NULL` is never true, and every row is filtered:
   an unbound caller gets a deterministic empty result and a `404`. The
   application connects with a role holding neither `BYPASSRLS` nor
   ownership of the tables, so a policy can never be silently inert.
8. **`provider_id` is never a method, DTO, query, path, or header
   parameter.** Ports and services take domain arguments only; the tenant is
   ambient, read from `TenantContext`, which is `@RequestScoped`, filled
   only by `TenantBoundInterceptor`, with `require()` and the unbound-safe
   `current()` public — `current()` exists for the connection hook, which
   must be able to bind nothing without throwing — and `assign()`/`clear()`
   package-private. An ArchUnit rule forbids any port
   or service method declaring a `providerId` parameter, and no request
   carries a tenant identifier anywhere. The one adjacent case is the public
   provider page: `/v1/providers/{slug}/…` resolves the slug **server-side**
   to a provider and binds it through the same ambient mechanism on a
   read-only path. A slug is a published identifier; a `provider_id`
   accepted from a caller is not.
9. **Four defence layers, all required, none sufficient alone.**
   (1) *Routing*: no tenant id in any provider-facing URL.
   (2) *Application*: `TenantContext` plus a guard on every write path.
   (3) *ORM*: a Hibernate filter on tenant entities, enabled where the
   session is obtained — a convenience so generated SQL carries the
   predicate, never the guarantee.
   (4) *PostgreSQL*: RLS `ENABLE`d **and** `FORCE`d (rule 7). A PR that adds
   a tenant-scoped table and stops at layer three does not ship.
10. **Cross-tenant references are made physically impossible by composite
    foreign keys `(provider_id, x_id)`.** An appointment references
    `(provider_id, service_offering_id)`, not a bare `service_offering_id`,
    so a row from another provider cannot be attached even with every
    application check bypassed. Each referenced table must therefore declare
    `UNIQUE (provider_id, id)` — without it PostgreSQL rejects the FK with
    `42830`. `provider_staff`, `service_offerings`, `customers` and
    `appointments` all carry it; the normative DDL lives in
    `booking-integrity`.
11. **A cross-tenant read returns `404 RESOURCE_NOT_FOUND`, never `403`.**
    There is ONE code for both a genuine miss and a cross-tenant read, and
    the two responses must be byte-identical down to the body: any
    difference turns the API into an existence oracle. There is no
    `TENANT_FORBIDDEN` and no per-resource `404` code. With RLS on this
    falls out naturally — the row simply is not visible, so the ordinary
    "not found" path runs.
12. **Cross-tenant access exists only behind an explicit `admin` route
    namespace**: separate paths, a dedicated privileged global role from the
    JWT, each operation naming its target provider explicitly in the path or
    body, and every call written to `audit_logs`. No implicit widening, no
    "all providers" magic value on a normal endpoint.
13. **One Keycloak realm.** Onboarding a provider is inserting rows in
    `providers` and `provider_staff`, not creating a realm, a client, or a
    group per provider. Keycloak holds accounts and global roles; it holds
    no tenant graph.
14. **Every tenant-scoped aggregate ships a non-leak test** proving, through
    the real stack (Testcontainers PostgreSQL 18, RLS forced, two seeded
    providers), that provider A can neither `SELECT`, `UPDATE`, nor `DELETE`
    provider B's rows, and that the REST surface answers `404`. A
    cross-tenant `UPDATE` or `DELETE` under RLS **affects zero rows — it
    does not raise**, so assert the row count, never an exception. Never H2,
    never a mocked repository: the behaviour under test is the database's.


> **Every read of a tenant table runs inside a transaction, including reads that
> change nothing.** `set_config('app.provider_id', ?, true)` is `SET LOCAL`:
> outside a transaction there is nothing for it to be local to, so it applies to
> that one statement and is gone by the next. Verified - the same query returns
> zero rows outside a transaction and the expected rows inside one.
>
> This does not fail loudly. It returns an empty result, which reads as "this
> tenant has no data" and produces a confidently wrong answer. In this codebase
> a single non-transactional lookup turned every server-chosen booking into a
> spurious "no eligible staff", and the request came back 409 on a free slot.
>
> The rule is mechanical: **if a method touches a tenant table, annotate it
> `@Transactional`.** Read-only is not an exemption, it is the dangerous case.

## Anti-patterns

- A read-only repository method left non-transactional "because it only reads"
  -> the GUC is gone by the second statement, RLS filters everything, and the
  caller gets an empty list instead of an error.

- Putting provider membership in a Keycloak claim (`provider_id`,
  `providers[]`, a group, a realm per provider). It cannot exist at first
  login, it forces a token refresh whenever staff change, and revocation
  waits for expiry → resolve from the database on every request (rule 2).
- A Redis (or Caffeine) `subject -> provider_id` cache "because the lookup
  is hot". A missed eviction is a live credential for the whole TTL →
  no cache on the authorisation path (rule 3).
- Reading `provider_staff` directly from the resolver and wondering why it
  returns nothing: RLS is on and no tenant is bound yet → the
  `SECURITY DEFINER` function (rule 4).
- A resolver doing `findBySubject(...).get(0)` over a many-to-many table →
  unique partial index plus `NoProviderMembershipException` (rule 5).
- Falling back to the caller's first membership, or to any provider, when
  resolution fails (fail-open) → reject with RFC 7807 (rule 5).
- A `@Transactional(MANDATORY)` `TenantSessionBinder` called from
  `TenantBoundInterceptor`. The interceptor is outside the transaction; the
  binder can never run, and every tenant query silently returns nothing →
  bind from the connection hook (rule 6).
- `current_setting('app.provider_id')::uuid` in a policy — `42704` when
  unbound — or `current_setting('app.provider_id', true)::uuid`, which is
  `22P02` on the empty string → the `nullif(...)` form, everywhere (rule 7).
- `SET app.provider_id = '…'` built by string concatenation: `SET` takes no
  bind placeholder, so this is an injection site → `set_config(?, ?, true)`
  (rule 6).
- `appointmentService.findById(providerId, appointmentId)` — the tenant
  passed as an argument puts the trust boundary in the caller →
  `findById(appointmentId)` with the tenant ambient (rule 8).
- Choosing the tenant from an `X-Provider-Id` header or `?provider_id=`
  query parameter, both spoofable → resolve from the verified `sub`
  (rules 2, 8).
- Application DB role with `BYPASSRLS`, or connecting as the table owner
  without `FORCE ROW LEVEL SECURITY` — RLS is silently inert →
  least-privilege role, forced policies (rule 7).
- Relying on a hand-written `WHERE provider_id = ?` as the *only* guard; one
  forgotten clause leaks everything → RLS under the application filter
  (rule 9).
- `appointments.service_offering_id` as a bare FK to `service_offerings(id)`
  → composite FK on `(provider_id, service_offering_id)` (rule 10).
- Returning `403`, or a distinct `TENANT_FORBIDDEN` / `APPOINTMENT_NOT_FOUND`
  code, for another provider's resource → one `404 RESOURCE_NOT_FOUND`
  (rule 11).
- An `admin` action reusing the provider endpoints with a wildcard tenant or
  an `X-Act-As-Provider` header → a distinct, role-gated, audited namespace
  (rule 12).
- A non-leak test asserting that a cross-tenant `UPDATE` throws. It does
  not; it updates zero rows → assert the count (rule 14).

## Minimal correct example

Forced RLS with the only sanctioned predicate:

```sql
-- V030__enable_rls_tenant_tables.sql
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON appointments
    USING      (provider_id
                = nullif(current_setting('app.provider_id', true), '')::uuid)
    WITH CHECK (provider_id
                = nullif(current_setting('app.provider_id', true), '')::uuid);

-- Repeat verbatim for customers, service_offerings, availability_rules,
-- availability_overrides, notifications, subscriptions, provider_staff.
-- The composite-FK excerpts and the appointments DDL itself are normative
-- in booking-integrity (V014__create_appointments.sql); do not restate them.
```

Membership resolution — one active membership, one privileged function:

```sql
-- V031__provider_membership_resolution.sql
CREATE UNIQUE INDEX provider_staff_one_active_membership
    ON provider_staff (user_id)
    WHERE user_id IS NOT NULL AND status = 'ACTIVE';

-- provider_staff is under RLS and no tenant is bound at resolution time,
-- so this is the one pre-tenant read: it returns a provider_id and nothing
-- else, and only the application role may execute it.
CREATE FUNCTION app_resolve_provider(p_subject text)
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_temp
AS $$
    SELECT ps.provider_id
      FROM provider_staff ps
      JOIN users u ON u.id = ps.user_id
     WHERE u.keycloak_user_id = p_subject
       AND ps.status = 'ACTIVE'
$$;

REVOKE ALL     ON FUNCTION app_resolve_provider(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app_resolve_provider(text) TO balaaca_app;
```

`TenantContext` is defined ONCE, in `shared-kernel`
(`com.balaaca.sharedkernel.tenancy`) — see `backend-di` for the canonical
class, `require()` public, `assign()`/`clear()` package-private. Do not
redeclare it. What belongs here is how it gets filled, fail-closed:

```java
// com.balaaca.sharedkernel.tenancy — same package as TenantContext, so
// assign/clear stay closed to everyone else.
@Interceptor @TenantBound
@Priority(Interceptor.Priority.PLATFORM_BEFORE + 10)
public class TenantBoundInterceptor {

    private final JsonWebToken jwt;
    private final TenantContext tenantContext;
    private final ProviderMembershipResolver memberships;

    @Inject
    public TenantBoundInterceptor(JsonWebToken jwt,
                                  TenantContext tenantContext,
                                  ProviderMembershipResolver memberships) {
        this.jwt = jwt;
        this.tenantContext = tenantContext;
        this.memberships = memberships;
    }

    @AroundInvoke
    Object bind(InvocationContext ctx) throws Exception {
        String subject = jwt.getSubject();
        if (subject == null || subject.isBlank()) {
            throw new UnauthenticatedException();
        }
        // Identity from the token, membership from the database, every
        // request, uncached. No membership means no access.
        ProviderId provider = memberships.requireFor(subject);

        tenantContext.assign(provider);
        try {
            return ctx.proceed();
        } finally {
            tenantContext.clear();
        }
    }
}
```

The resolver: two joins behind the privileged function, no cache, no
`Optional` unwrapped by the caller.

```java
// providers/adapters/outbound/persistence
@ApplicationScoped
public class JdbcProviderMembershipResolver
        implements ProviderMembershipResolver {   // port: sharedkernel.tenancy

    private final AgroalDataSource dataSource;

    @Inject
    public JdbcProviderMembershipResolver(AgroalDataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public ProviderId requireFor(String keycloakSubject) {
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps =
                 c.prepareStatement("SELECT app_resolve_provider(?)")) {
            ps.setString(1, keycloakSubject);
            try (ResultSet rs = ps.executeQuery()) {
                UUID providerId = rs.next() ? (UUID) rs.getObject(1) : null;
                if (providerId == null) {
                    throw new NoProviderMembershipException(keycloakSubject);
                }
                return new ProviderId(providerId);
            }
        } catch (SQLException e) {
            throw new TenantResolutionUnavailableException(e);
        }
    }
}
```

The GUC binding. This runs on the connection as it is handed to the
transaction — the only place that is both inside the transaction and ahead
of the first business statement:

```java
// com.balaaca.sharedkernel.tenancy
@ApplicationScoped
public class TenantConnectionInterceptor implements AgroalPoolInterceptor {

    private final TenantContext tenantContext;

    @Inject
    public TenantConnectionInterceptor(TenantContext tenantContext) {
        this.tenantContext = tenantContext;
    }

    @Override
    public void onConnectionAcquire(Connection connection) {
        // TenantBoundInterceptor (PLATFORM_BEFORE + 10) has already filled
        // TenantContext; Quarkus opened the transaction at + 200; the
        // connection is enlisted now. Unbound paths bind the empty string,
        // which the policy predicate turns into NULL: zero rows, not 500.
        String providerId = tenantContext.current()
                .map(p -> p.value().toString())
                .orElse("");
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT set_config('app.provider_id', ?, true)")) {
            ps.setString(1, providerId);
            ps.execute();   // is_local = true: dies with the transaction
        } catch (SQLException e) {
            throw new TenantBindingFailedException(e);
        }
    }

    @Override
    public void onConnectionReturn(Connection connection) {
        // Belt and braces: SET LOCAL already expired at commit or rollback.
        try (Statement s = connection.createStatement()) {
            s.execute("SELECT set_config('app.provider_id', '', false)");
        } catch (SQLException e) {
            throw new TenantBindingFailedException(e);
        }
    }
}
```

Non-leak test through the real database — note the write assertions:

```java
@QuarkusTest
class AppointmentTenantIsolationTest {

    @Test
    void providerCannotReachAnotherProvidersAppointments() {
        UUID mine   = seedAppointmentFor(PROVIDER_A);
        UUID theirs = seedAppointmentFor(PROVIDER_B);

        runAsProvider(PROVIDER_A, () -> {
            assertThat(appointments.findAll())
                    .extracting(Appointment::id).containsExactly(mine);

            // RLS hides the row: absent, not forbidden. REST answers 404
            // RESOURCE_NOT_FOUND, byte-identical to a genuine miss.
            assertThat(appointments.findById(theirs)).isEmpty();

            // A cross-tenant write AFFECTS ZERO ROWS. It does not raise.
            assertThat(appointments.cancelById(theirs)).isZero();
            assertThat(appointments.deleteById(theirs)).isZero();
        });

        assertThat(rawCount("appointments", theirs)).isOne();  // untouched
    }
}
```

## Sibling skills

- `booking-integrity` — owns the normative `appointments` DDL; its exclusion
  constraint is keyed on `provider_id` and `staff_id`, so isolation and
  anti-double-booking share the same columns.
- `idempotency-concurrency` — the `UNIQUE (provider_id, idempotency_key)`
  index and the replay path on these same tables.
- `outbox-messaging` — `notifications` rows carry `provider_id`, but the
  worker connects under its own database role with its own policy; it never
  binds `TenantContext` and never reads as a tenant.
- `cdi-interceptors` — `@TenantBound`, its priority, and why the GUC binding
  is a connection hook rather than another interceptor.
- `backend-architecture` — why the tenant is ambient rather than threaded
  through ports, and where `providers` sits as tenant root.
- `platform-api` — no tenant identifier in any request, and the single
  `RESOURCE_NOT_FOUND` code behind rule 11.
- `backend-tests` — Testcontainers PostgreSQL 18 is mandatory for the
  non-leak and IDOR/BOLA suites; the database is never mocked.
- `backend-exceptions` — `NoProviderMembershipException` and its RFC 7807
  mapping.
