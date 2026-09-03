---
name: backend-tests
description: Use when adding or reviewing a test for any bounded-context class - an *IT against Testcontainers PostgreSQL 18, a jqwik property on Money or slot calculation, the tenant non-leak / IDOR matrix / booking concurrency suites, an ArchUnit rule, or a change to the JaCoCo or PIT gates - and whenever a PR reaches for H2, a mocked EntityManager, a single-threaded idempotency test, or a service method that takes provider_id as a parameter.
---

# backend-tests

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

The enforcement backbone of the Definition of Done. Every unit is proven by a
real-database integration test, invariants by property-based tests, and
architecture by ArchUnit - with mutation and coverage gates that fail the build,
not just warn.

## When to use

- Adding any class in a bounded-context module (identity, providers, catalog,
  scheduling, booking, billing, shared-kernel) or in a satellite deployable
  (notification-worker, chatbot-service) - it ships with its tests in the same
  PR, never "later".
- Touching Money, slot calculation, the appointment state machine, idempotency,
  entitlements, or tenant scoping - these carry mandatory property-based and/or
  integration coverage.
- Writing or changing any adapter that talks to PostgreSQL, Redis, or Keycloak - the test must exercise the real thing via Testcontainers, not a hand-rolled
  mock.
- Any PR: it must keep JaCoCo coverage and the PIT mutation score at or above the
  gate, and keep every ArchUnit rule green.

## The rules

1. **Naming and layout.** Unit + property tests are `<ClassName>Test.java` and
   run under Surefire. Slow, container-backed tests are `<ClassName>IT.java` and
   run under Failsafe (`mvn verify`). The test package mirrors `src/main/java`
   exactly. Never `*Tests`, never `Test<ClassName>`.
2. **given / when / then.** Structure every test body in three visible sections
   (blank-line separated or `// given` comments), and name it for the behavior,
   not the method: `rejectsOverlappingAppointmentForSameStaff()`, not
   `testCreate()`. Use `@DisplayName` for human-readable intent and `@Nested` to
   group a scenario.
3. **NEVER mock the database in an integration test.** Persistence, RLS, unique
   constraints, the GiST exclusion constraint, the `ck_appointments_*` CHECKs and
   optimistic-lock version bumps are tested against a **real PostgreSQL 18**
   through Testcontainers - in Quarkus this is Dev Services (zero-config
   container) or an explicit `@QuarkusTestResource`. No H2, no in-memory fake, no
   mocked `EntityManager`, no mocked repository when the thing under test *is*
   the persistence behavior. A constraint that only PostgreSQL enforces cannot be
   proven by a database that does not have it.
4. **Redis and Keycloak get real doubles at the boundary, not internal mocks.**
   Cache and rate limiting run against a Redis container; OIDC identity runs
   against a Keycloak container or a signed test JWT minted with the test realm's
   key. Tenant resolution is never faked at the claim level: the test seeds
   `users` and `provider_staff` and lets the real resolution chain run, because
   the database - not the token - is the source of truth for membership. There is
   no membership cache to prime or evict; the resolver is a two-join lookup on
   primary-key paths (see `multi-tenant-rls`). A user with no `ACTIVE` row must
   produce `NoProviderMembershipException`, and that case gets its own test.
5. **Tests enter a tenant exactly the way production does.** Drive the three
   mandatory suites through the **real HTTP surface with a signed test JWT** - RestAssured against the `@QuarkusTest` port - so the whole chain runs as
   deployed: the interceptor chain, `ProviderMembershipResolver`, the
   request-scoped `TenantContext`, and the **connection-level RLS binding** that
   issues `SELECT set_config('app.provider_id', ?, true)` as the first statement
   on the enlisted connection. A test that injects a use case and calls it
   directly skips all four and proves nothing about tenancy. Where an assertion
   really is about a bean's internals, every worker thread must activate its own
   request context (`Arc.container().requestContext()` activate/terminate),
   because `TenantContext` is `@RequestScoped` and a bare pool thread has none.
   **No test invents a tenant parameter**: `provider_id` is ambient, never an
   argument to a service method that has no such parameter.
6. **Property-based tests (jqwik) guard Money arithmetic AND slot calculation.**
   For `Money`: arithmetic never overflows, never loses minor units, rejects
   mixed-currency operations, respects the currency's own scale - GNF has scale
   0, so no example may assume "cents" - and `allocate` distributes a total with
   no minor unit created or destroyed. Commutativity properties must generate
   both operands from the *same* currency, or they assert the mixed-currency
   rejection instead. For scheduling: a generated set of `AvailabilityRule` plus
   `AvailabilityOverride` plus booked appointments yields slots that are always
   inside an opening window, never overlap an existing appointment once buffers
   are applied, and are always a whole number of the service's granularity apart.
   The rule generator must produce windows where `end_time < start_time` - a
   provider open 22:00–01:00 wraps into the next local date and is legal - and
   must assert that an equal pair is rejected rather than read as 24 hours.
   Slot properties run under `Africa/Conakry`, a northern DST zone
   (`Europe/Paris`) **and** a southern one (`America/Santiago`): Guinea is UTC+0
   with no DST, which hides timezone bugs, and a southern zone catches the
   assumption that clocks spring forward in March (see `temporal-modelling`).
7. **The calculator and the constraint must be proven to agree.** `busy` is the
   **stored** `blocked_range` of each PENDING/CONFIRMED appointment, which
   already carries that appointment's own frozen buffers and is never widened
   again; the calculator widens only the *candidate* slot, by the *requested*
   service's buffers. A mandatory property test closes the loop: every slot the
   calculator proposes is then INSERTed against real PostgreSQL and must succeed - no `23P01`. If that property is red, the API is advertising slots the
   exclusion constraint rejects (see `booking-integrity`).
8. **Three suites are mandatory, by name, and none may be deleted.**
   - **Tenant non-leak**, one test per tenant-scoped aggregate (Provider,
     ProviderStaff, ServiceOffering, AvailabilityRule, AvailabilityOverride,
     Appointment, Customer, Subscription), run under the unprivileged
     application role - never as the owner, which silently bypasses RLS. Assert
     the three distinct behaviors precisely: a SELECT under provider A returns
     zero of provider B's rows; an UPDATE or DELETE naming B's row **affects
     zero rows and raises nothing** - the USING predicate filters it before the
     write, so assert `0` affected and that B's row is unchanged afterwards; an
     INSERT that names B's `provider_id` **does** raise, because it fails the
     policy's WITH CHECK.
   - **IDOR/BOLA matrix**, a parameterised table of every tenant-scoped REST
     resource: provider A's token against provider B's resource must return
     **404 with code `RESOURCE_NOT_FOUND`**, byte-identical to a genuine miss - never 403, never a per-resource code, or the response is an existence
     oracle. A companion test asserts the matrix covers every tenant-scoped path
     in the OpenAPI document, so adding a resource without adding its row fails
     the build rather than quietly shipping an unguarded endpoint.
   - **Booking concurrency**, two tests, both against real PostgreSQL because
     the invariant is the GiST exclusion constraint. (a) *Named staff*: N
     parallel POSTs with the same `service_offering_id`, `staff_id` and
     `starts_at` yield exactly one 201 and N-1 409 carrying `SLOT_UNAVAILABLE`.
     (b) *Any available staff*: a provider with N eligible staff receives N
     concurrent requests that name **no** `staff_id`, and must yield **N
     successes on N distinct `staff_id` values** - the server-chosen path
     retries the unit of work against the next candidate on `23P01`, so a
     spurious 409 while a chair sits empty is a bug, not contention (see
     `booking-integrity`).
9. **Concurrency and idempotency are tested together, never sequentially.** Fire
   two concurrent requests with the same `Idempotency-Key` and the same body, and
   assert exactly one committed appointment plus one replayed response. A
   single-threaded "call twice" does not satisfy this rule. A third test replays
   the key with a **different** body and asserts 422 `IDEMPOTENCY_KEY_REUSED`,
   because the stored request fingerprint is what makes a replay safe (see
   `idempotency-concurrency`).
10. **ArchUnit is a required test, run in CI.** Encode the locked architecture as
    executable rules: `domain/` imports no framework (no `jakarta.persistence`,
    no `io.quarkus`, no `jakarta.ws.rs`, no adapter package); dependencies point
    inward (adapters -> application -> ports -> domain, never the reverse), with
    `com.balaaca.sharedkernel` explicitly exempt from the four-layer shape
    because it is a flat set of cross-cutting packages; **cross-context imports
    of `..domain..`, `..application..` and `..adapters..` are forbidden**, with
    an explicit allowlist of published types, since one Maven module per context
    means the compiler cannot enforce a ports-only boundary and ArchUnit is the
    only thing that can; the **deployable list is closed**, covering the seven
    contexts *and* the two satellites, so a stray package under `com.balaaca`
    fails; and **no gRPC and no broker type appears anywhere** - no `io.grpc`,
    no `.proto`, no Kafka or Redpanda client. Intra-core calls go through Java
    inbound ports; asynchronous work goes through the notifications outbox table
    (see `backend-architecture`, `outbox-messaging`).
11. **State-machine transitions are tested exhaustively.** For the appointment
    status machine, assert every legal transition succeeds and every illegal one
    is rejected atomically (`UPDATE ... WHERE status = :expected`). Cover the
    seams: an appointment is cancelled with a reason, never physically deleted;
    the frozen `customer_price_amount_minor` on a past appointment does not move
    when the `ServiceOffering` price changes afterwards; the frozen
    `buffer_before_minutes` / `buffer_after_minutes` likewise stay put; and an
    outbox row is written in the same transaction as the status change, with the
    dedupe key that embeds the target instant
    (`appointment:{uuid}:REMINDER_24H:{scheduled_at_epoch_seconds}`), so a
    reschedule produces a new key rather than colliding with the old one.
12. **Coverage and mutation gates cover the core, and they fail the build.**
    JaCoCo enforces the line/branch threshold at `verify`; PIT enforces the
    mutation score. Both are scoped to `domain/` and `application/` in the seven
    contexts **plus** `com/balaaca/sharedkernel/{money,time,logging}/**`, which
    has no `domain/` segment to be caught by a wildcard - `LocalWindows` is the
    most DST-critical class in the product and an include pattern that misses it
    leaves the gate wide open exactly where it matters. Adapters, generated
    OpenAPI interfaces, MapStruct output and Flyway migrations are excluded:
    gating adapters buys plumbing tests that assert a mapper copies a field,
    which raises the number without raising confidence. Exclusions are declared
    once in the parent POM and are never extended to sneak a fresh domain class
    past the gate. You fix a red gate by adding tests, not by lowering it.
13. **Assertions are behavioral, not log-sniffing.** Assert on returned values,
    persisted state, rows in `notifications`, and RFC 7807 problem bodies
    including the stable error code and its snake_case wire fields. Logging,
    audit, tracing and metrics are interceptor concerns - do not assert on
    stdout (see `cdi-interceptors`, `pii-masking-logging`).

## Anti-patterns

- Mocking the repository port / `EntityManager` to "unit test" a query -> rule 3;
  write an `*IT` against the PostgreSQL container.
- `@QuarkusTest` with an H2 or in-memory datasource for speed -> rule 3; H2 has
  no `EXCLUDE USING gist` and no RLS, so the suite would be green and the
  product broken.
- Injecting a use case and calling it from a raw thread pool in one of the
  mandatory suites -> rule 5; no request scope, no interceptor chain, no
  `app.provider_id` on the connection. Drive it over HTTP with a signed JWT.
- `Executors.newFixedThreadPool(...)` around a `@RequestScoped` bean without
  `Arc.container().requestContext().activate()` per thread -> rule 5; the
  failure is a `ContextNotActiveException` at best and a leaked caller context
  at worst.
- Asserting that a cross-tenant UPDATE throws -> rule 8; under RLS it affects
  **zero rows** and raises nothing. Assert the affected count and the untouched
  row. Only an INSERT that names another tenant raises, via WITH CHECK.
- Running the isolation suite as the database owner or a `BYPASSRLS` role ->
  rule 8; RLS is `FORCE`d for a reason, test under the application role.
- Asserting 403, `TENANT_FORBIDDEN`, or `APPOINTMENT_NOT_FOUND` on a
  cross-tenant read -> rule 8; every one of those confirms the row exists.
  `RESOURCE_NOT_FOUND`, always.
- One example-based test asserting `2000 GNF + 3000 GNF == 5000 GNF` and calling
  money "done" -> rule 6; add a jqwik `@Property`.
- A commutativity property that generates two independent currencies -> rule 6;
  it will fail on the mixed-currency rejection it should be asserting elsewhere.
- Slot-calculation tests that only ever run under `Africa/Conakry` -> rule 6;
  UTC+0 with no DST hides exactly the bugs the property is for.
- A slot generator that never emits `end_time < start_time` -> rule 6; a
  provider open 22:00–01:00 exists and must round-trip.
- Widening `busy` ranges by the requested service's buffers in the test helper
  -> rule 7; `blocked_range` already contains its own frozen buffers, and
  double-widening makes the test agree with a calculator that is wrong.
- Adding a new tenant-scoped resource without a row in the IDOR matrix ->
  rule 8; the coverage test is there to make that impossible.
- A booking test that posts once and asserts 201 -> rule 8; N threads, one 201,
  N-1 409.
- Asserting 409 for N concurrent "any available staff" requests at a salon with
  N free chairs -> rule 8(b); the expected result is N successes.
- Sequential "call twice, both succeed" as an idempotency test -> rule 9; run
  them concurrently and assert exactly one commit.
- Deleting the ArchUnit test because it "blocks the PR" -> rule 10; fix the
  dependency direction instead.
- A closed-context ArchUnit rule listing only the seven contexts -> rule 10; the
  satellites are real deployables under `com.balaaca` and would fail a rule they
  were never under.
- JaCoCo `includes` of `com/balaaca/*/domain/**` alone -> rule 12; shared-kernel
  is flat, so `money`, `time` and `logging` fall outside the gate entirely.
- Adding a JaCoCo/PIT exclusion for the domain class you just wrote -> rule 12;
  write the test.

## Minimal correct example

```java
// Mandatory suite 3 of 3 - booking concurrency, driven over the REAL HTTP
// surface with a signed test JWT so the interceptor chain, the membership
// resolver and the connection-level app.provider_id binding all run as in
// production (rule 5). The invariant is a GiST exclusion constraint, so only
// PostgreSQL can prove it: no Redis lock, no SELECT FOR UPDATE.
@QuarkusTest
class AppointmentConcurrencyIT {

    private static final int THREADS = 16;

    @Inject TestFixtures fixtures;   // seeds users + provider_staff, mints JWTs

    @Test
    @DisplayName("Exactly one of N concurrent bookings wins a named slot")
    void allowsExactlyOneBookingForTheSameStaffAndInstant() throws Exception {
        // given one provider, one staff member, one offering, one instant
        var scope = fixtures.providerWithOwnerStaff("chez-fatou");
        var offering = fixtures.serviceOffering(scope, 30);
        var token = fixtures.signedJwtFor(scope.ownerUserId());
        var body = Map.of(
            "service_offering_id", offering.id().toString(),
            "staff_id",            scope.ownerStaffId().toString(),
            "starts_at",           "2026-03-12T09:00:00Z",
            "customer_id",         fixtures.customer(scope).id().toString());

        // when THREADS clients race for it, each with its own idempotency key
        var responses = fixtures.race(THREADS, () ->
            given().auth().oauth2(token)
                .contentType("application/json")
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .body(body)
                .post("/v1/appointments"));

        // then one wins and every loser gets the one published conflict code
        assertThat(responses).filteredOn(r -> r.statusCode() == 201).hasSize(1);
        assertThat(responses).filteredOn(r -> r.statusCode() == 409)
            .hasSize(THREADS - 1)
            .allSatisfy(r -> assertThat(r.jsonPath().getString("code"))
                .isEqualTo("SLOT_UNAVAILABLE"));
        assertThat(fixtures.appointmentCountAt(scope, "2026-03-12T09:00:00Z"))
            .isEqualTo(1);
    }

    @Test
    @DisplayName("N concurrent any-staff requests fill N distinct chairs")
    void servesEveryConcurrentAnyStaffRequestWhenChairsRemain() throws Exception {
        // given a salon with N free chairs and no staff_id in the request
        var scope = fixtures.providerWithStaff("salon-mariama", THREADS);
        var offering = fixtures.serviceOffering(scope, 30);
        var token = fixtures.signedJwtFor(scope.ownerUserId());

        // when THREADS customers ask for "anyone", all at the same instant
        var responses = fixtures.race(THREADS, () ->
            given().auth().oauth2(token)
                .contentType("application/json")
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .body(Map.of(
                    "service_offering_id", offering.id().toString(),
                    "starts_at",           "2026-03-12T09:00:00Z",
                    "customer_id",         fixtures.customer(scope).id().toString()))
                .post("/v1/appointments"));

        // then the server retried each 23P01 onto the next candidate: N wins,
        // N distinct staff. A 409 here would mean a chair sat empty.
        assertThat(responses).allSatisfy(r -> assertThat(r.statusCode()).isEqualTo(201));
        assertThat(responses).map(r -> r.jsonPath().getString("staff_id"))
            .doesNotHaveDuplicates().hasSize(THREADS);
    }
}

// Rule 5, for the rare direct-bean assertion only. TenantContext is
// @RequestScoped, so a bare pool thread must own its own request context.
static <T> T inRequestScope(Supplier<T> body) {
    var ctx = Arc.container().requestContext();
    ctx.activate();
    try { return body.get(); } finally { ctx.terminate(); }
}

// Mandatory suite 2 of 3 - IDOR/BOLA matrix. Adding a tenant-scoped resource
// without a row here fails coversEveryTenantScopedPath().
class TenantResourceMatrixIT {

    static Stream<TenantResource> tenantScopedResources() {
        return Stream.of(
            new TenantResource("/v1/service-offerings/{id}",       Fixtures::serviceOffering),
            new TenantResource("/v1/staff/{id}",                   Fixtures::staff),
            new TenantResource("/v1/availability-rules/{id}",      Fixtures::availabilityRule),
            new TenantResource("/v1/availability-overrides/{id}",  Fixtures::availabilityOverride),
            new TenantResource("/v1/appointments/{id}",            Fixtures::appointment),
            new TenantResource("/v1/customers/{id}",               Fixtures::customer),
            new TenantResource("/v1/subscription",                 Fixtures::subscription));
    }

    @ParameterizedTest(name = "{0} is invisible across tenants")
    @MethodSource("tenantScopedResources")
    void returnsNotFoundForAnotherProvidersResource(TenantResource resource) {
        var owned = resource.createUnder(providerB);

        given().auth().oauth2(tokenFor(providerA))
            .get(resource.path(), owned.id())
        .then()
            .statusCode(404)                    // never 403: no existence oracle
            .contentType("application/problem+json")
            .body("code", equalTo("RESOURCE_NOT_FOUND"));  // same as a real miss
    }

    @Test
    @DisplayName("Every tenant-scoped path in the contract has a matrix row")
    void coversEveryTenantScopedPath() {
        assertThat(tenantScopedResources().map(TenantResource::path))
            .containsExactlyInAnyOrderElementsOf(OpenApiDocument.tenantScopedPaths());
    }
}

// Mandatory suite 1 of 3, the write half. Under RLS a cross-tenant UPDATE is
// FILTERED, not refused: zero rows, no exception (rule 8).
@Test
void crossTenantUpdateAffectsZeroRowsAndRaisesNothing() {
    var target = fixtures.appointmentUnder(providerB);

    var affected = fixtures.asProvider(providerA, () ->
        em.createQuery("update AppointmentEntity a set a.status = :s where a.id = :id")
          .setParameter("s", CANCELLED).setParameter("id", target.id())
          .executeUpdate());

    assertThat(affected).isZero();
    assertThat(fixtures.reloadAsOwner(target).status()).isEqualTo(CONFIRMED);
}

// Property test - the calculator and the constraint must agree (rule 7), run
// under UTC+0 and both hemispheres' DST (rule 6).
class SlotCalculationPropertyIT {

    @Property
    void everyProposedSlotIsActuallyInsertable(
            @ForAll("openingHours") List<AvailabilityRule> rules,
            @ForAll("overrides") List<AvailabilityOverride> overrides,
            @ForAll("booked") Map<StaffId, List<InstantRange>> busy,
            @ForAll("zones") ZoneId zone) {
        // busy holds STORED blocked_range values: their own frozen buffers are
        // already inside them and are never widened again.
        var slots = SlotCalculator.forDay(rules, overrides, busy, SERVICE_30_MIN,
                                          zone, DAY);

        assertThat(slots).allSatisfy(slot ->
            assertThatNoException().isThrownBy(() ->
                fixtures.insertIfAbsentInRolledBackTx(slot)));   // no 23P01
    }

    @Provide Arbitrary<ZoneId> zones() {
        return Arbitraries.of(
            ZoneId.of("Africa/Conakry"),    // UTC+0, no DST: the launch market
            ZoneId.of("Europe/Paris"),      // northern DST
            ZoneId.of("America/Santiago")); // southern DST, offsets move the
                                            // other way in March
    }
}

// Architecture test - hexagonal boundaries, closed deployable list, ports-only
// cross-context boundary, no gRPC or broker type anywhere.
@AnalyzeClasses(packages = "com.balaaca",
                importOptions = ImportOption.DoNotIncludeTests.class)
class HexagonalArchitectureTest {

    // Seven contexts plus the two satellite deployables. Both are real
    // packages under com.balaaca and must be admitted (rule 10).
    private static final String[] DEPLOYABLES = {
        "com.balaaca.sharedkernel..",       "com.balaaca.identity..",
        "com.balaaca.providers..",          "com.balaaca.catalog..",
        "com.balaaca.scheduling..",         "com.balaaca.booking..",
        "com.balaaca.billing..",            "com.balaaca.notificationworker..",
        "com.balaaca.chatbot.." };

    @ArchTest static final ArchRule domain_is_framework_free =
        noClasses().that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAnyPackage(
                "jakarta.persistence..", "jakarta.ws.rs..", "jakarta.enterprise..",
                "io.quarkus..", "..adapters..");

    // shared-kernel is the ONE context exempt from the four-layer shape: it is
    // a flat set of cross-cutting packages (money, time, logging, tenancy,
    // error), so the layer rule must not be applied to it.
    @ArchTest static final ArchRule layers_point_inward =
        layeredArchitecture().consideringOnlyDependenciesInAnyPackage("com.balaaca..")
            .layer("Adapters").definedBy("com.balaaca.(*)..adapters..")
            .layer("Application").definedBy("com.balaaca.(*)..application..")
            .layer("Domain").definedBy("com.balaaca.(*)..domain..")
            .whereLayer("Adapters").mayNotBeAccessedByAnyLayer()
            .whereLayer("Application").mayOnlyBeAccessedByLayers("Adapters")
            .ignoreDependency(resideInAPackage("com.balaaca.sharedkernel.."),
                              alwaysTrue());

    // One Maven module per context, so the COMPILER cannot stop context A from
    // importing context B's internals: ArchUnit is the boundary (rule 10).
    @ArchTest static final ArchRule contexts_talk_through_inbound_ports_only =
        noClasses().that().resideInAPackage("com.balaaca.(*)..")
            .should().dependOnClassesThat(
                resideInAnyPackage("..domain..", "..application..", "..adapters..")
                    .and(not(belongToTheSameContext()))
                    .and(not(publishedPortAllowlist())))
            .because("a sibling context is reachable only through its inbound "
                   + "ports and published types");

    @ArchTest static final ArchRule deployable_list_is_closed =
        classes().that().resideInAPackage("com.balaaca..")
            .should().resideInAnyPackage(DEPLOYABLES)
            .because("the seven contexts and two satellites are settled");

    // There is no broker and no RPC in this project: core -> core is an
    // in-process inbound-port call, async work goes through the outbox table.
    @ArchTest static final ArchRule no_rpc_and_no_broker =
        noClasses().should().dependOnClassesThat().resideInAnyPackage(
                "io.grpc..", "org.apache.kafka..", "io.smallrye.reactive.messaging.kafka..")
            .because("no gRPC, no Kafka, no Redpanda: ports in-process, outbox for async");
}
```

The gates in the parent `pom.xml` must actually *match* shared-kernel, which is
flat and has no `domain/` segment:

```xml
<!-- JaCoCo includes. The last three lines are load-bearing: LocalWindows lives
     in com.balaaca.sharedkernel.time and a com/balaaca/*/domain/** pattern
     alone leaves the most DST-critical class in the product ungated. -->
<includes>
  <include>com/balaaca/*/domain/**</include>
  <include>com/balaaca/*/application/**</include>
  <include>com/balaaca/sharedkernel/money/**</include>
  <include>com/balaaca/sharedkernel/time/**</include>
  <include>com/balaaca/sharedkernel/logging/**</include>
</includes>
```

```bash
# Fast unit + property tests only
mvn test

# Full DoD gate: Failsafe *IT (Testcontainers), ArchUnit, JaCoCo, PIT
mvn verify

# Mutation score for the code that carries the critical invariants
mvn -pl scheduling,booking,shared-kernel org.pitest:pitest-maven:mutationCoverage
```

## Sibling skills

- `backend-architecture` - the hexagonal boundaries and closed deployable list ArchUnit enforces.
- `booking-integrity` - the exclusion constraint and the any-staff retry the concurrency suite proves.
- `multi-tenant-rls` - the connection-level `app.provider_id` binding a test must exercise, not fake.
- `money-currency` - the `Money`/`Currency` invariants property-tested here.
- `temporal-modelling` - why slot properties run under both hemispheres' DST.
- `idempotency-concurrency` - the fingerprint replay and `IDEMPOTENCY_KEY_REUSED` asserted here.
- `outbox-messaging` - the notifications rows and dedupe keys asserted in the same transaction.
- `platform-api` - the closed error-code catalogue the IDOR matrix asserts against.
- `contract-first` - the OpenAPI document the IDOR matrix checks itself against.
- `ci-workflow` - where these gates run and block the merge.
- `backend-naming` - the `*Test` / `*IT` suffix convention.
- `cdi-interceptors` - why logging, audit and tracing are not asserted in tests.
