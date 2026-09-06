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
  scheduling, booking, billing) or in either kernel (shared-kernel,
  platform-kernel), or in the satellite deployable `notification-worker` - it
  ships with its tests in the same PR, never "later". `chatbot-service` is a
  reserved directory with no code in it yet, so nothing here applies to it.
- Touching Money, slot calculation, the appointment state machine, idempotency,
  entitlements, or tenant scoping - these carry mandatory property-based and/or
  integration coverage.
- Writing or changing any adapter that talks to PostgreSQL or Redis - the test
  must exercise the real thing via Testcontainers, not a hand-rolled mock. The
  OIDC boundary is the exception, and rule 4 says why.
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
   through Testcontainers - here that is one explicit `@QuarkusTestResource`,
   `PostgresTestResource`, which starts `postgres:18.6` and creates the same
   least-privilege roles the real bootstrap does. **Not Dev Services**, even
   though it is the zero-config option: Dev Services connects as a single
   superuser, for which RLS is silently inert, so every isolation test would
   pass while the thing it claims to prove was switched off. No H2, no in-memory
   fake, no mocked `EntityManager`, no mocked repository when the thing under
   test *is* the persistence behavior. A constraint that only PostgreSQL
   enforces cannot be proven by a database that does not have it.
4. **Redis is a real container. The identity provider is not, on purpose.**
   Cache and rate limiting run against a Redis container started beside
   PostgreSQL by the same `PostgresTestResource`, and that is load-bearing:
   `application.properties` names a Redis host, an explicit host disables Dev
   Services, and before that container the integration suites were writing to
   the developer's own Redis, taking NOAUTH, and letting the rate limiter fail
   open while the test that was meant to prove the limit passed. **There is no
   Keycloak container and no signed test JWT anywhere in the tree**: the caller
   is supplied in-process by Quarkus's `@TestSecurity` plus
   `@OidcSecurity(claims = @Claim(key = "sub", ...))`. That is a decision, not
   an omission - what is under test is what the database does with a subject,
   not that an identity provider can sign - and it is safe only because of the
   next sentence. Tenant resolution is never faked at the claim level: the test
   seeds `users` and `provider_staff` and lets the real resolution chain run,
   because the database - not the token - is the source of truth for
   membership. There is
   no membership cache to prime or evict; the resolver is a two-join lookup on
   primary-key paths (see `multi-tenant-rls`). A user with no `ACTIVE` row must
   produce `NoProviderMembershipException`, and that case gets its own test.
5. **Tests enter a tenant exactly the way production does.** Drive the
   mandatory suites through the **real HTTP surface** - RestAssured against the
   `@QuarkusTest` port, with the subject supplied as in rule 4 - so the whole
   chain runs as deployed: the interceptor chain, `ProviderMembershipResolver`, the
   request-scoped `TenantContext`, and the **connection-level RLS binding** that
   issues `SELECT set_config('app.provider_id', ?, true)` as the first statement
   on the enlisted connection. A test that injects a use case and calls it
   directly skips all four and proves nothing about tenancy. Where an assertion
   really is about a bean's internals, every worker thread must activate its own
   request context (`Arc.container().requestContext()` activate/terminate),
   because `TenantContext` is `@RequestScoped` and a bare pool thread has none.
   **No test invents a tenant parameter**: `provider_id` is ambient, never an
   argument to a service method that has no such parameter.
6. **Property-based tests (jqwik) guard Money arithmetic. Slot calculation is
   still owed one.** For `Money`: arithmetic never overflows, never loses minor
   units, rejects mixed-currency operations, respects the currency's own scale - GNF has scale
   0, so no example may assume "cents" - and `allocate` distributes a total with
   no minor unit created or destroyed. Commutativity properties must generate
   both operands from the *same* currency, or they assert the mixed-currency
   rejection instead. `MoneyTest` is the **only** jqwik class in the backend, and
   that is the gap: **there is no slot-calculation property**. `SlotCalculatorTest`
   is example-based, exercising the calculator as a pure function under
   `Africa/Conakry` and `Europe/Paris`, so nothing generates `AvailabilityRule`
   plus `AvailabilityOverride` plus booked appointments together and asserts
   across the whole set that slots are always inside an opening window, never
   overlap an existing appointment once buffers are applied, and are always a
   whole number of the service's granularity apart. When that property is
   written, its rule generator must produce windows where `end_time <
   start_time` - a provider open 22:00-01:00 wraps into the next local date and
   is legal, which is why `LocalWindow.spansMidnight()` exists - and must assert
   that an equal pair is rejected rather than read as 24 hours, which is what
   `LocalWindow`'s constructor and `ck_availability_rules_span` already do. It
   must also run under a **southern** DST zone: no test in the tree names one.
   Guinea is UTC+0 with no DST, which hides timezone bugs outright, and
   `Europe/Paris` alone only proves the northern half - nothing here catches the
   assumption that clocks spring forward in March (see `temporal-modelling`).
7. **The calculator and the constraint must be proven to agree.** `busy` is the
   **stored** `blocked_range` of each PENDING/CONFIRMED appointment, which
   already carries that appointment's own frozen buffers and is never widened
   again; the calculator widens only the *candidate* slot, by the *requested*
   service's buffers. The loop is closed by two integration tests, not by a
   property: `AvailabilityIT.offeredSlotsAreActuallyBookable` takes the first
   slot the public list offers and POSTs it, and
   `MultiChairAvailabilityIT.offersOnlyWhatItWillAccept` does the same once a
   second chair exists. **There is no `SlotCalculationPropertyIT`** - it was
   never written, so one example stands where a generated set belongs, and a
   slot the calculator only proposes at an awkward boundary is untested. If
   either test is red, the API is advertising slots the exclusion constraint
   rejects (see `booking-integrity`).
8. **Three subjects are mandatory. Two are covered, one is not, and nothing
   already there may be deleted.**
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
   - **IDOR/BOLA**: provider A's token against provider B's resource must return
     **404 with code `RESOURCE_NOT_FOUND`**, byte-identical to a genuine miss - never 403, never a per-resource code, or the response is an existence
     oracle. That rule *is* asserted, resource by resource, inside each
     resource's own suite (`PublicBookingIT.crossTenantOfferingIsNotFound`,
     `SocialLinkIT`'s `Tenancy` group, and their equivalents elsewhere). What
     does **not** exist is the parameterised matrix this file used to pin, nor
     the companion test that would check it against every tenant-scoped path in
     the OpenAPI document: no `TenantResourceMatrixIT`, no
     `coversEveryTenantScopedPath`. Neither was deleted; neither was ever
     written. The cost is exactly the one the matrix was for - a new
     tenant-scoped resource ships with no cross-tenant test and nothing fails,
     so write the per-suite assertion by hand until the matrix exists.
   - **Booking concurrency** (`BookingConcurrencyIT`), against real PostgreSQL
     because the invariant is the GiST exclusion constraint. Ten racers fire at
     once through HTTP, released together by a latch, and leave exactly one 201
     and nine 409 - plus **zero 500 and zero 503**, which is the sharp end: the
     losers' SQLSTATE is not deterministic (`23P01` at three racers, `40P01`
     deadlock at two, five and ten), a deadlock says nothing about whether the
     slot is free, so it is retried, and a loser whose retry budget ran out must
     still be told the slot is taken rather than that the system is busy. What
     is **not** covered concurrently is the multi-chair case: every race here
     runs at a one-chair provider. A salon with N eligible staff receiving N
     concurrent requests that name no `staff_id` must yield **N successes on N
     distinct `staff_id` values**, because the server-chosen path retries
     against the next candidate on `23P01` - a spurious 409 while a chair sits
     empty is a bug, not contention - and today only the sequential version of
     that is asserted, in `MultiChairAvailabilityIT` (see `booking-integrity`).
9. **Concurrency and idempotency are tested together, never sequentially.** Fire
   two concurrent requests with the same `Idempotency-Key` and the same body, and
   assert exactly one committed appointment plus one replayed response. A
   single-threaded "call twice" does not satisfy this rule. A third test replays
   the key with a **different** body and asserts 422 `IDEMPOTENCY_KEY_REUSED`,
   because the stored request fingerprint is what makes a replay safe (see
   `idempotency-concurrency`).
10. **ArchUnit is a required test, run in CI.** `ArchitectureTest`, in
    `com.balaaca.app.arch`, and not an `*IT`: it reads bytecode, needs no
    database, and runs under Surefire in seconds. Encode the locked
    architecture as executable rules: `domain/` imports no framework (no
    `jakarta..`, no `io.quarkus`, no `org.hibernate`, and not
    `com.balaaca.platformkernel` either, which would drag CDI, JWT and Agroal
    behind everything importing it); dependencies point inward, enforced as two
    negatives rather than a `layeredArchitecture()` - nothing in `..domain..`,
    `..ports..` or `..application..` may touch `..adapters..`, and `..domain..`
    and `..ports..` may not touch `..application..`; **cross-context imports
    of `..domain..`, `..application..` and `..adapters..` are forbidden**, with
    an explicit allowlist of published domain types, since one Maven module per
    context means the compiler cannot enforce a ports-only boundary and ArchUnit
    is the only thing that can; the **package list is closed** - the two
    kernels, the six contexts and `com.balaaca.app`, so a stray top-level
    package fails; and **no gRPC and no broker type appears anywhere** - no
    `io.grpc`, no `com.google.protobuf`, no Kafka client. The kernels are exempt
    from the layer shape not by an `ignoreDependency` but by construction: the
    per-context rules loop over the six contexts and the kernels are flat sets
    of cross-cutting packages with no `domain/` segment to catch. **The
    satellites are not on that closed list and must not be added**:
    `notification-worker` is a separate Maven project whose classes are never on
    this classpath, and it carries its own, stronger rule -
    `the_worker_imports_nothing_of_the_core`, which forbids it any Balaaca
    artifact at all. Intra-core calls go through Java inbound ports;
    asynchronous work goes through the notifications outbox table (see
    `backend-architecture`, `outbox-messaging`).
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
12. **The two gates are scoped differently, and both fail the build.** They are
    not two views of one rule, so do not reason about them as a pair.
    - **JaCoCo is one whole-bundle number.** The `check` goal runs at `verify`
      in **`backend/app/pom.xml`**, not the parent - the parent only wires the
      two agents, the merge and the report. One rule, on element `BUNDLE`:
      `INSTRUCTION` / `COVEREDRATIO` at a minimum of `0.78`, set below the
      83.3% it measured on the day, because a threshold equal to the current
      number turns the next honest refactor red and gets the gate deleted. It
      reads `jacoco-quarkus.exec` from the Quarkus extension rather than the
      bare agent, because Quarkus rewrites classes during augmentation and a
      report built from the bare agent's exec file reads every adapter as 0%
      while the integration suites are driving them. **There is no `<includes>`
      list anywhere in the tree**, so adapters are deliberately *inside* the
      gate - measured at 79.6% for the providers adapter, which is the point.
      The single `<excludes>` entry is `com/balaaca/app/api/**`: those types
      are generated from the contract, and leaving the generator's getters,
      `equals` and `toString` in moved the ratio from 83% to 50% the day the
      contract landed without one test having got worse.
    - **PIT is per-module and narrower.** Each module carries its own
      `mutationThreshold` and its own target: `com.balaaca.scheduling.domain.*`
      at 68, `com.balaaca.booking.domain.*` at 78, and
      `com.balaaca.sharedkernel.{money,phone}.*` at 50, the last one wider on
      purpose because jqwik reseeds every run and a mutation killed by one draw
      survives the next. **No `application/` package is mutation-tested at all**,
      and no other module runs PIT.
    `LocalWindows` never existed and there is no `com.balaaca.sharedkernel.time`
    or `.logging` package to gate: the DST-critical type is **`LocalWindow`, in
    `com.balaaca.scheduling.domain`**, which both gates already cover - JaCoCo
    because it excludes almost nothing, PIT because scheduling's domain is one
    of its three targets. You fix a red gate by adding tests, not by lowering
    the threshold and not by adding an exclusion for the class you just wrote.
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
  `app.provider_id` on the connection. Drive it over HTTP, with the subject
  supplied by `@TestSecurity` / `@OidcSecurity`.
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
  UTC+0 with no DST hides exactly the bugs a zone parameter exists to catch.
- A slot generator that never emits `end_time < start_time` -> rule 6; a
  provider open 22:00-01:00 exists and must round-trip.
- Widening `busy` ranges by the requested service's buffers in the test helper
  -> rule 7; `blocked_range` already contains its own frozen buffers, and
  double-widening makes the test agree with a calculator that is wrong.
- Adding a new tenant-scoped resource and assuming some matrix already covers
  it cross-tenant -> rule 8; no matrix exists, so the 404 assertion has to be
  written into that resource's own suite by hand.
- A booking test that posts once and asserts 201 -> rule 8; N threads, one 201,
  N-1 409.
- Asserting 409 for N concurrent "any available staff" requests at a salon with
  N free chairs -> rule 8; the expected result is N successes, and nothing
  asserts it yet, so nobody will catch you.
- Sequential "call twice, both succeed" as an idempotency test -> rule 9; run
  them concurrently and assert exactly one commit.
- Deleting the ArchUnit test because it "blocks the PR" -> rule 10; fix the
  dependency direction instead.
- Adding `com.balaaca.notificationworker..` to the closed package list ->
  rule 10; the satellite's classes are never on this classpath, so the entry
  would sit there proving nothing while the rule that does hold it - its own
  `the_worker_imports_nothing_of_the_core` - lives in the satellite.
- Adding a JaCoCo `<includes>` list to "focus" the gate -> rule 12; there is
  none today, the gate is the whole bundle, and the first include pattern
  someone writes silently drops everything it forgot.
- Adding a JaCoCo/PIT exclusion for the domain class you just wrote -> rule 12;
  write the test.

## Minimal correct example

```java
// Booking concurrency, as it is actually written. Driven over the REAL HTTP
// surface (rule 5) so the tenant binder, the interceptor chain and the
// connection-level app.provider_id binding all run as in production. The
// invariant is a GiST exclusion constraint, so only PostgreSQL can prove it:
// no Redis lock, no SELECT FOR UPDATE. This one races the PUBLIC booking path,
// where the tenant comes from the slug and there is no caller to authenticate.
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class BookingConcurrencyIT {

    private static final int RACERS = 10;

    @Inject BookingFixtures fixtures;   // seeds users, provider_staff, offerings

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("Ten simultaneous bookings on one slot leave exactly one winner")
    void oneWinnerOnly() throws Exception {
        // when RACERS clients race for the same instant, released together
        Map<Integer, Long> byStatus = race(
                "/v1/providers/coiffeur-solo/appointments",
                BookingFixtures.SOLO_OFFERING, "2026-10-01T09:00:00Z");

        // then one wins and every loser is told the slot is taken - and told it
        // as a 409, never as a 500 and never as a 503. The losers' SQLSTATE is
        // not deterministic: 23P01 at three racers, 40P01 deadlock at ten. A
        // deadlock says nothing about whether the slot is free, so it is
        // retried; a racer whose budget ran out must still get the truth from
        // the committed data rather than "the system is busy".
        assertThat(byStatus.getOrDefault(201, 0L)).isEqualTo(1);
        assertThat(byStatus.getOrDefault(409, 0L)).isEqualTo(RACERS - 1);
        assertThat(byStatus.getOrDefault(500, 0L)).isZero();
        assertThat(byStatus.getOrDefault(503, 0L)).isZero();

        // and the API's answer is checked against the database, not trusted
        assertThat(fixtures.activeAppointments(BookingFixtures.SOLO)).isEqualTo(1);
    }

    /** Fires RACERS requests released together by a latch, and counts statuses. */
    private Map<Integer, Long> race(String path, UUID offering, String startsAt)
            throws Exception {
        CountDownLatch releaseAll = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(RACERS)) {
            List<Future<Integer>> futures = IntStream.range(0, RACERS)
                    .mapToObj(i -> pool.submit(() -> {
                        releaseAll.await();
                        return given().contentType("application/json")
                                .header("Idempotency-Key", "racer-" + startsAt + "-" + i)
                                .body(bookingFor(offering, startsAt, i))
                                .when().post(path)
                                .then().extract().statusCode();
                    }))
                    .toList();
            releaseAll.countDown();
            return count(futures);
        }
    }
}

// NOT WRITTEN YET, and rule 8 says it should be. Every race above runs at a
// one-chair provider, so the any-staff retry has never been tested under
// contention. Written, it would look like this - and a 409 in it would mean a
// customer was refused while a chair sat empty.
@Test
@DisplayName("N concurrent any-staff requests fill N distinct chairs")
void servesEveryConcurrentAnyStaffRequestWhenChairsRemain() throws Exception {
    // given a salon with RACERS free chairs and no staff_id in any request
    fixtures.seedChairs(BookingFixtures.SALON, RACERS);

    var byStatus = race("/v1/providers/salon-fatou/appointments",
                        BookingFixtures.SALON_OFFERING, "2026-10-01T09:00:00Z");

    // then the server retried each 23P01 onto the next candidate: N wins on N
    // distinct staff, which is what "any available staff" promises.
    assertThat(byStatus.getOrDefault(201, 0L)).isEqualTo(RACERS);
    assertThat(fixtures.distinctStaffBooked(BookingFixtures.SALON)).isEqualTo(RACERS);
}

// Rule 5, for the rare direct-bean assertion only. TenantContext is
// @RequestScoped, so a bare pool thread must own its own request context.
static <T> T inRequestScope(Supplier<T> body) {
    var ctx = Arc.container().requestContext();
    ctx.activate();
    try { return body.get(); } finally { ctx.terminate(); }
}

// NOT WRITTEN, and rule 8 wants it. Cross-tenant 404 is asserted today one
// resource at a time, inside each resource's own suite, so a new tenant-scoped
// route ships with no such test and nothing goes red. This is the shape that
// would make that impossible; note that the paths must come from the contract,
// because half the guesses a reader would make (/v1/availability-rules,
// /v1/subscription) are not routes this API has.
class TenantResourceMatrixIT {

    static Stream<TenantResource> tenantScopedResources() {
        return Stream.of(
            new TenantResource("/v1/service-offerings/{id}", Fixtures::serviceOffering),
            new TenantResource("/v1/staff/{id}",             Fixtures::staff),
            new TenantResource("/v1/closures/{id}",          Fixtures::closure),
            new TenantResource("/v1/customers/{id}",         Fixtures::customer));
    }

    @ParameterizedTest(name = "{0} is invisible across tenants")
    @MethodSource("tenantScopedResources")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void returnsNotFoundForAnotherProvidersResource(TenantResource resource) {
        var owned = resource.createUnder(BookingFixtures.SOLO);

        given().when().get(resource.path(), owned.id())
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

// Tenant non-leak, the write half. Under RLS a cross-tenant UPDATE is
// FILTERED, not refused: zero rows, no exception (rule 8). BookingFixtures
// distinguishes the two on purpose - writeAsProvider returns the affected count,
// or -1 when the database refused outright - because a missing GRANT raises
// while a missing POLICY quietly matches nothing, and only one of those is
// visible to a test that asserts "it throws".
@Test
void crossTenantUpdateAffectsZeroRowsAndRaisesNothing() {
    long affected = fixtures.writeAsProvider(BookingFixtures.SALON, """
            UPDATE appointments SET status = 'CANCELLED'
             WHERE provider_id = '%s'
            """.formatted(BookingFixtures.SOLO));

    assertThat(affected).as("filtered by USING, not refused").isZero();
    assertThat(fixtures.activeAppointments(BookingFixtures.SOLO)).isEqualTo(1);
}

// NOT WRITTEN. There is no jqwik anywhere outside MoneyTest, so nothing
// generates rules, overrides and bookings together and nothing runs the
// calculator under a southern-hemisphere zone (rules 6 and 7). Today the
// calculator-agrees-with-the-constraint loop is closed by a single example, in
// AvailabilityIT.offeredSlotsAreActuallyBookable. This is what would close it
// properly.
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

// Architecture test, as written: ArchitectureTest in com.balaaca.app.arch.
// Hexagonal boundaries, a closed PACKAGE list, a ports-only cross-context
// boundary, no gRPC and no broker type anywhere. Not an *IT - it reads bytecode
// and runs under Surefire in seconds.
@AnalyzeClasses(packages = "com.balaaca",
                importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    // The bounded contexts. Not the kernels, and not the deployable's own
    // wiring - the per-context rules below loop over exactly these, which is
    // how the two flat kernels stay exempt from the layer shape without an
    // ignoreDependency anyone could widen.
    private static final String[] CONTEXTS = {
        "identity", "providers", "catalog", "scheduling", "booking", "billing"
    };

    @ArchTest static final ArchRule domain_imports_no_framework =
        noClasses().that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAnyPackage(
                "jakarta..", "io.quarkus..", "org.hibernate..", "io.agroal..",
                "org.eclipse.microprofile..", "com.balaaca.platformkernel..")
            .because("a domain rule that needs a container to run is a rule "
                   + "nobody unit-tests, and platform-kernel drags CDI, JWT "
                   + "and Agroal behind everything that imports it");

    // Two negatives rather than layeredArchitecture(): the layer helper wants
    // one (*) capture per layer, and the capture is substituted on one side of
    // the comparison and taken literally on the other.
    @ArchTest static final ArchRule nothing_inward_depends_on_an_adapter =
        noClasses().that().resideInAnyPackage("..domain..", "..ports..", "..application..")
            .should().dependOnClassesThat().resideInAPackage("..adapters..")
            .because("an adapter is one implementation of a port, and the "
                   + "inside naming it is the dependency inverted");

    @ArchTest static final ArchRule the_domain_and_its_ports_ignore_the_application_layer =
        noClasses().that().resideInAnyPackage("..domain..", "..ports..")
            .should().dependOnClassesThat().resideInAPackage("..application..")
            .because("orchestration knows about rules; rules must not know "
                   + "which orchestration invoked them");

    // One Maven module per context, so the COMPILER cannot stop context A from
    // importing context B's internals: ArchUnit is the boundary (rule 10).
    // Written as a loop for the same reason as above.
    @ArchTest
    static void a_context_touches_only_another_context_s_ports(JavaClasses classes) {
        for (String context : CONTEXTS) {
            for (String other : CONTEXTS) {
                if (context.equals(other)) {
                    continue;
                }
                noClasses().that().resideInAPackage("com.balaaca." + context + "..")
                        .should().dependOnClassesThat().resideInAnyPackage(
                                "com.balaaca." + other + ".domain..",
                                "com.balaaca." + other + ".application..",
                                "com.balaaca." + other + ".adapters..")
                        .allowEmptyShould(true)
                        .check(classes);
            }
        }
    }

    // The satellite is NOT here and must not be added: it is a separate Maven
    // project, none of its classes are on this classpath, and its own rule -
    // the_worker_imports_nothing_of_the_core - asserts the stronger thing.
    @ArchTest static final ArchRule every_package_is_a_declared_module =
        classes().that().resideInAPackage("com.balaaca..")
            .should().resideInAnyPackage(
                "com.balaaca.sharedkernel..", "com.balaaca.platformkernel..",
                "com.balaaca.identity..", "com.balaaca.providers..",
                "com.balaaca.catalog..", "com.balaaca.scheduling..",
                "com.balaaca.booking..", "com.balaaca.billing..",
                "com.balaaca.app..")
            .because("a new top-level package is a new bounded context, which "
                   + "is a decision with an ADR behind it");

    // There is no broker and no RPC in this project: core -> core is an
    // in-process inbound-port call, async work goes through the outbox table.
    @ArchTest static final ArchRule there_is_no_broker_and_no_grpc =
        noClasses().should().dependOnClassesThat().resideInAnyPackage(
                "io.grpc..", "com.google.protobuf..",
                "org.apache.kafka..", "io.vertx.kafka..")
            .because("a broker is deferred until volume forces one (ADR-0004)");
}
```

The coverage gate lives in `backend/app/pom.xml`, not the parent, because that
is the only module from which every context's classes are exercised. The parent
wires the two agents, the merge and the report and stops there:

```xml
<!-- One rule, whole bundle. There is deliberately NO <includes>: an include
     list is a promise to remember every package anyone adds, and the first
     thing it forgets falls out of the gate silently. dataFile matters as much -
     Quarkus rewrites classes during augmentation, so a report built from the
     bare agent's exec file reads every adapter as 0% while the integration
     suites are driving them. -->
<configuration>
  <dataFile>${project.build.directory}/jacoco-quarkus.exec</dataFile>
  <!-- Generated from the contract. Leaving the generator's getters, equals and
       toString in moved the ratio from 83% to 50% the day the contract landed,
       without one test having got worse. -->
  <excludes>
    <exclude>com/balaaca/app/api/**</exclude>
  </excludes>
  <rules>
    <rule>
      <element>BUNDLE</element>
      <limits>
        <!-- 83.3% the day this was set. The gate sits below it, not at it: a
             threshold equal to the current number turns the next honest
             refactor red and gets the gate deleted. -->
        <limit>
          <counter>INSTRUCTION</counter>
          <value>COVEREDRATIO</value>
          <minimum>0.78</minimum>
        </limit>
      </limits>
    </rule>
  </rules>
</configuration>
```

```bash
# Fast unit + property tests only
mvn test

# Full DoD gate: Failsafe *IT (Testcontainers), ArchUnit, JaCoCo, PIT
mvn verify

# Mutation score for the code that carries the critical invariants. Only these
# three modules run PIT, each with its own threshold: 68, 78, 50.
mvn -pl scheduling,booking,shared-kernel org.pitest:pitest-maven:mutationCoverage
```

## Sibling skills

- `backend-architecture` - the hexagonal boundaries and closed package list ArchUnit enforces.
- `booking-integrity` - the exclusion constraint and the any-staff retry the concurrency suite proves.
- `multi-tenant-rls` - the connection-level `app.provider_id` binding a test must exercise, not fake.
- `money-currency` - the `Money`/`Currency` invariants property-tested here.
- `temporal-modelling` - why slot tests owe a southern-hemisphere zone.
- `idempotency-concurrency` - the fingerprint replay and `IDEMPOTENCY_KEY_REUSED` asserted here.
- `outbox-messaging` - the notifications rows and dedupe keys asserted in the same transaction.
- `platform-api` - the closed error-code catalogue the cross-tenant 404 asserts against.
- `contract-first` - the OpenAPI document an IDOR matrix would check itself against.
- `ci-workflow` - where these gates run and block the merge.
- `backend-naming` - the `*Test` / `*IT` suffix convention.
- `cdi-interceptors` - why logging, audit and tracing are not asserted in tests.
