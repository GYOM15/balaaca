---
name: ci-workflow
description: Use when editing .github/workflows/*.yml or a pom.xml gate (JaCoCo, PIT, ArchUnit, Semgrep, OSV-Scanner, Trivy, Syft, gitleaks), bootstrapping CI for a new module or satellite deployable, adding a .trivyignore entry, wiring the image smoke-boot or a deploy step, or debugging a pipeline that did not trigger, went red, or claims a server-side gate this private repository does not have.
---

# ci-workflow

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

GitHub Actions pipeline that mechanically enforces the Definition of Done on
every module of the Quarkus modular monolith. A change is not "done" until the
pipeline is green: build, all test levels, static analysis, security scans, and
the coverage + mutation gates. No merge into `develop` — and no promotion into
`main` — without it.

## When to use

- Editing any `.github/workflows/*.yml` or a module `pom.xml` that changes a
  gate (JaCoCo, PIT, ArchUnit, Semgrep, OSV-Scanner, Trivy, Syft, gitleaks).
- Bootstrapping CI for a new bounded-context module (identity, providers,
  catalog, scheduling, booking, billing, shared-kernel) or a satellite
  deployable (notification-worker, chatbot-service).
- A push didn't trigger CI (usually a branch that doesn't match `branch-naming`)
  or a gate is missing from the chain.
- Adding or renewing a `.trivyignore` waiver.
- Debugging a red pipeline before touching thresholds.

## The rules

1. **One pipeline shape, and every PR runs it — including the promotion PR.**
   `develop` is the integration branch and the GitHub default; `main` is the
   release branch and stays releasable. Feature branches are cut from `develop`
   and merged back into `develop` via a PR; `develop` is promoted to `main` at
   phase milestones through a PR as well (see `branch-naming`). The workflow
   therefore runs on `pull_request` targeting **`[develop, main]`** and on `push`
   to `develop` and to `main`. Restricting the `pull_request` trigger to
   `develop` alone leaves the one PR that ships code to users running no gate at
   all. Never commit straight to `main`.
2. **Job order is a gate chain, fail-fast.** `build` -> `test` ->
   `static-analysis` -> `security` -> `image`. A later job never starts if an
   earlier one is red. The whole chain must be green before the PR is merged.
3. **Build = Maven multi-module, JDK 21.** `mvn -B verify` at the reactor root on
   Temurin 21, virtual threads enabled. Use `actions/setup-java` cache for
   `~/.m2`. Server interfaces and client stubs are generated into `target/`
   during this step from the single hand-authored OpenAPI document that lives in
   the runner/API module. Generated sources are **never committed**, so there is
   nothing to drift and no drift check to run; what CI does run is a spec lint
   and `openapi-diff` against the spec on the base branch, which fails the build
   on a backward-incompatible change (see `contract-first`).
4. **All test levels run under one `mvn verify`, no mocked DB.** Unit plus
   integration (Testcontainers PostgreSQL 18, Redis, Keycloak — NEVER an
   in-memory or mocked database), jqwik property tests on Money arithmetic and
   slot calculation, ArchUnit rules, and the three mandatory suites: tenant
   non-leak, the IDOR/BOLA matrix, and booking concurrency (both the named-staff
   and the any-available-staff test). Testcontainers needs a Docker daemon on the
   runner; do not swap it for H2 to "speed up" CI — H2 has neither RLS nor
   `EXCLUDE USING gist`, so the suite would be green while the product is broken
   (see `backend-tests`).
5. **Coverage gate + mutation gate both block the merge, scoped to the core.**
   JaCoCo enforces the line/branch threshold at `verify` (`mvn` fails, not a
   report you read later). PIT enforces the mutation-score threshold. Both cover
   `domain/` and `application/` in the seven contexts **plus** the flat
   shared-kernel packages `com/balaaca/sharedkernel/{money,time,logging}/**` —
   shared-kernel has no `domain/` segment, so a `com/balaaca/*/domain/**`
   pattern alone silently drops `Money` and `LocalWindows` out of both gates.
   Adapters and generated code are excluded, because gating adapters buys
   plumbing tests that assert a mapper copies a field. Lowering either threshold
   to make a PR pass is forbidden.
6. **Static analysis blocks, and it is keyless.** Semgrep runs as **OSS with a
   local ruleset committed to the repo** (`semgrep scan --config
   .semgrep/ --error`), never `semgrep ci` with a `SEMGREP_APP_TOKEN`: the App
   flow needs a hosted account, and a token that is absent on a fork or a fresh
   clone turns the gate into a silent no-op. **SonarQube is not used at all** —
   its quality gate requires a paid hosted instance, so it has no place in this
   pipeline. No `continue-on-error` on any analysis job.
7. **Security scans block, four of them, all keyless.** gitleaks for secrets,
   run as its **MIT-licensed binary** rather than the action, which bills
   organisation accounts; **OSV-Scanner** for vulnerable dependencies — keyless
   and it resolves transitive Maven dependencies, unlike OWASP Dependency-Check,
   which throttles to a multi-minute NVD warm-up without an API key and whose
   13.0.0 release fails outright when the key is absent; **Trivy** against the
   built image, failing on HIGH/CRITICAL; **Syft** to emit the SBOM as a build
   artifact. Secrets never live in the repo — in CI they come from GitHub
   Actions repository secrets referenced by name, and at runtime from injected
   env or secret files on the VPS at deploy time.
8. **Trivy runs with `ignore-unfixed: true` and a committed, expiring
   `.trivyignore`.** A single HIGH in the base image with no upstream fix would
   otherwise block every merge in the repository indefinitely, and the only
   escapes then available are lowering the severity or `continue-on-error` —
   both of which delete the gate. So: `ignore-unfixed: true` keeps the gate on
   findings someone can actually act on, and anything else that must be waived
   goes in `.trivyignore`, where **every entry carries a justification comment
   and an `exp:` date**. Trivy stops honouring the entry on that date, and a
   dedicated lint step fails the build on an entry that is expired or that has
   no justification and no expiry. A waiver is a decision with a review date,
   never a permanent hole.
9. **Image = distroless/UBI-minimal, non-root, multi-stage, multi-arch.** The
   `image` job builds the container only after every gate is green, then
   Trivy-scans it. Base is distroless or UBI-minimal, runs as a non-root UID,
   multi-stage so the build layer is discarded. Build for `linux/amd64` and
   `linux/arm64`: a VPS is the real target and a Raspberry Pi is only a
   transitional first step, so the image must run on both without any design
   decision bending to a Pi's resources. Push with two tags: the git SHA and
   `latest` — the SHA is the immutable one deploys pin.
10. **The image job boots the image, and the boot must be able to succeed.**
    Unit and integration tests run in the test profile, so a production-only
    configuration mistake — a required environment variable with no default, a
    missing OIDC URL — is invisible to every one of them and surfaces at deploy.
    A smoke boot that cannot reach readiness proves nothing, so give it what
    production gives it: a **user-defined Docker network** (never the deprecated
    `--link`, which does not resolve on a modern daemon), a throwaway PostgreSQL
    with `QUARKUS_DATASOURCE_USERNAME` / `QUARKUS_DATASOURCE_PASSWORD` matching
    it, `QUARKUS_FLYWAY_MIGRATE_AT_START=true` so the schema exists, and an
    **explicit test OIDC issuer** — a Keycloak container on the same network —
    because Quarkus OIDC resolves its discovery document at startup and fails
    without one. Then wait for `/q/health/ready` before scanning or pushing.
11. **Flyway migrations never run against a shared or production database from
    CI.** The real cluster migration is a deploy step. CI applies migrations in
    two safe places: against the Testcontainers PostgreSQL during integration
    tests, and against the throwaway database of the smoke boot in rule 10 — a
    disposable container that exists for ninety seconds is not a database anyone
    can lose. What is forbidden is pointing `flyway:migrate` at a database
    somebody else is using.
12. **Pin every action to a 40-character commit SHA, never a tag.** A tag is
    mutable: its owner can silently repoint it, which is exactly how the
    `trivy-action` and `kics-github-action` supply-chain compromises worked.
    Write `uses: owner/action@<40-char-sha> # v7` so the version stays readable
    while the reference stays immutable. The local Semgrep ruleset blocks on
    this.
13. **Local hooks are the only enforcer of commit shape and branch shape, and
    they are bypassable.** A `commit-msg` hook enforces the house commit format
    and a `pre-commit` hook runs gitleaks; a `pre-push` hook guards both `main`
    and `develop` against direct pushes and rejects a branch name that breaks
    the naming rules. `branch-naming` holds the one authoritative copy of that
    hook — do not restate a second, divergent version here or anywhere else.
    All of it is client-side and `--no-verify` walks past every line of it. CI
    does not lint commit messages and does not verify signatures, so **do not
    document commit signing or message format as an enforced gate** (see
    `commit-style`). Everything else CI re-verifies server-side, so a bypassed
    hook still hits every gate in the pipeline.
14. **Branch protection is unavailable, so say so and compensate.** GitHub
    server-side branch protection and required status checks are not available
    on a **private** repository without a paid plan. The interim measure is the
    `pre-push` hook of rule 13. Be honest about what that buys: a convention
    plus review discipline, not enforcement. Do not write documentation claiming
    `main` is protected or that commits are verified. When the repository goes
    public or the plan changes, turn on real protection, require every gate as a
    status check, and require signed commits that day.
15. **Day-1 target is a VPS + containers.** Deploy pulls the SHA-tagged image on
    the VPS and restarts the service behind a health check
    (`/q/health/ready`, bounded retries). No Kubernetes and no Terraform until a
    concrete scaling need justifies them — don't add them to the pipeline
    speculatively.

## Anti-patterns

- A workflow whose **only** `pull_request` trigger is `main` -> rule 1; day-to-day
  PRs target `develop` and would run nothing. The trigger list is
  `[develop, main]`, so both the feature PR and the promotion PR are gated.
- Dropping `main` from the `pull_request` trigger -> rule 1; the promotion PR is
  the last chance to catch a regression before it is released.
- Any mention of SonarQube, `sonar:sonar`, or a `SONAR_TOKEN` in a workflow ->
  rule 6; the quality gate needs a paid hosted instance and is out of the
  pipeline entirely.
- `semgrep ci` with `SEMGREP_APP_TOKEN` -> rule 6; run `semgrep scan` against
  the committed local ruleset so the gate works with no account.
- `continue-on-error: true` on a test or scan job -> a real gate that never
  blocks; remove it, let the job fail the pipeline.
- H2, in-memory or mocked DB in integration tests to dodge Docker on the runner
  -> rule 4; a mocked database cannot enforce RLS or the exclusion constraint.
- Dropping the JaCoCo or PIT threshold in `pom.xml` to turn a red PR green ->
  fix or add tests; thresholds only ratchet up.
- Extending the JaCoCo exclusion list to cover a new `domain/` class -> rule 5;
  the exclusions are for adapters and generated code, nothing else.
- Gate patterns that match only `com/balaaca/*/domain/**` -> rule 5;
  shared-kernel is flat, so `Money` and `LocalWindows` fall outside both gates.
- Trivy with neither `ignore-unfixed` nor a `.trivyignore` -> rule 8; one
  unfixable base-image CVE blocks every merge forever, and the next commit is
  always the one that lowers the severity threshold.
- Lowering Trivy to `CRITICAL` only, or adding `continue-on-error`, to get past
  a CVE -> rule 8; waive that CVE explicitly, with a reason and an expiry.
- A `.trivyignore` line with no justification and no `exp:` date -> rule 8; the
  lint step fails on it, and it would otherwise outlive everyone who understood
  it.
- A dependency scanner that silently needs an API key -> it either throttles to
  uselessness or fails closed on a CI runner; pick a keyless one.
- The billed gitleaks action instead of the MIT binary -> rule 7.
- An action referenced by tag rather than a 40-character commit SHA -> rule 12.
- An action pinned to a major that still runs on the Node 20 runtime -> removed
  from GitHub-hosted runners on 2026-09-16; every action must be node24.
- Pushing an image that was never started -> rule 10.
- `docker run --link pg` in the boot step -> rule 10; `--link` is deprecated and
  the container will not resolve the hostname. Create a network with
  `docker network create` and attach both containers to it.
- Booting the image with a JDBC URL but no `QUARKUS_DATASOURCE_USERNAME` /
  `_PASSWORD`, no `QUARKUS_FLYWAY_MIGRATE_AT_START`, and no OIDC issuer ->
  rule 10; readiness can never turn green and the ninety-second timeout is the
  only thing the step ever proves.
- Building `linux/amd64` only -> rule 9; arm64 is required for the transitional
  Pi step.
- `[skip ci]` on a "trivial" change -> the pipeline catches config and contract
  drift; never skip it.
- `flyway:migrate` pointed at a shared or production database from CI ->
  rule 11; a throwaway smoke-boot container is fine, a database someone else
  uses is not.
- A second copy of the `pre-push` hook pasted into this file or a README ->
  rule 13; `branch-naming` owns it, and two copies drift.
- A CI step that verifies commit signatures, or a document claiming they are
  verified -> rule 13; signing is a local hook only until the plan changes.
- Hardcoding a token in a workflow `env:` block -> reference a GitHub Actions
  secret by name; runtime secrets come from injected env or secret files on the
  VPS.
- `docker build` on a plain non-distroless base running as root -> distroless or
  UBI-minimal, non-root, multi-stage, then Trivy-scan.
- Adding a Kubernetes or Terraform deploy stage on day 1 -> VPS + containers
  until a scaling need is proven.
- Deploying the `latest` tag -> pin the immutable git-SHA tag so the running
  version is unambiguous.
- A README asserting that `main` is protected by GitHub -> rule 14; it is not,
  and a false claim is worse than a documented gap.

## Minimal correct example

`.github/workflows/ci.yml` — the gate chain:

```yaml
name: ci
on:
  pull_request:
    branches: [develop, main]   # the promotion PR is gated too (rule 1)
  push:
    branches: [develop, main]

jobs:
  build-test:
    runs-on: ubuntu-latest        # provides a Docker daemon for Testcontainers
    steps:
      # Every action is pinned to a 40-character commit SHA; the trailing
      # comment keeps the human-readable version visible (rule 12).
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - uses: actions/setup-java@c5195efecf7bdfc987ee8bae7a71cb8b11521c00 # v4.7.1
        with:
          distribution: temurin
          java-version: '21'
          cache: maven
      # verify = compile + unit + Testcontainers IT + jqwik + ArchUnit + the
      # three mandatory suites, then the JaCoCo and PIT gates (both fail).
      - run: mvn -B -T1C verify
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with: { name: jacoco, path: '**/target/site/jacoco/**' }

  static-analysis:
    needs: build-test
    runs-on: ubuntu-latest
    container: { image: semgrep/semgrep }   # OSS image, no account, no token
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: semgrep scan --config .semgrep/ --error   # local committed ruleset

  security:
    needs: static-analysis
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
        with: { fetch-depth: 0 }
      - name: Secret scan (MIT binary, not the billed action)
        run: |
          curl -sSfL -o gl.tar.gz \
            https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
          tar -xzf gl.tar.gz gitleaks
          ./gitleaks detect --source . --redact --exit-code 1
      - uses: google/osv-scanner-action@e69cc6c86b31f1e7e23935bbe7031b50e51082de # v2.5.1
      # A waiver is a decision with a review date: an expired or unjustified
      # .trivyignore entry fails the build here, before Trivy ever runs (rule 8)
      - name: Lint the CVE waivers
        run: ./ci/check-trivyignore.sh .trivyignore

  image:
    needs: security
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    env: { IMAGE: registry.example/balaaca/api }
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - uses: docker/setup-buildx-action@e468171a9de216ec08956ac3ada2f0791b6bd435 # v3.11.1
      # multi-stage Dockerfile: distroless/UBI-minimal base, non-root UID.
      # Load the amd64 image locally so it can be booted and scanned; the
      # multi-arch manifest is built again straight to the registry on push,
      # because buildx cannot --load more than one platform.
      - run: |
          docker buildx build --platform linux/amd64 \
            --load -t "$IMAGE:${{ github.sha }}" .
      # Rule 10: a smoke boot only proves something if it CAN reach ready. A
      # user-defined network (not --link), real datasource credentials, Flyway
      # against the throwaway database, and a real OIDC issuer to discover.
      - name: Boot the image and wait for readiness
        run: |
          # Generated per run, never written down. An inline literal here would
          # be harmless in itself, but it teaches the habit this project bans
          # everywhere else - and it trips every secret scanner that reads a
          # --password flag, which desensitises reviewers to real findings.
          SMOKE_PASSWORD="$(openssl rand -hex 24)"
          export SMOKE_PASSWORD

          docker network create balaaca-smoke
          docker run -d --name pg --network balaaca-smoke \
            -e POSTGRES_DB=balaaca \
            -e POSTGRES_USER=balaaca \
            -e POSTGRES_PASSWORD="$SMOKE_PASSWORD" postgres:18
          docker run -d --name kc --network balaaca-smoke \
            -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
            -e KC_BOOTSTRAP_ADMIN_PASSWORD="$SMOKE_PASSWORD" \
            quay.io/keycloak/keycloak:26.4 start-dev
          timeout 120 sh -c \
            'until docker exec -e P="$SMOKE_PASSWORD" kc \
               /opt/keycloak/bin/kcadm.sh config credentials \
               --server http://localhost:8080 --realm master \
               --user admin --password "$P" >/dev/null 2>&1; do sleep 3; done'
          docker exec kc /opt/keycloak/bin/kcadm.sh create realms \
            -s realm=balaaca-test -s enabled=true
          docker run -d --name api --network balaaca-smoke -p 8080:8080 \
            -e QUARKUS_DATASOURCE_JDBC_URL=jdbc:postgresql://pg:5432/balaaca \
            -e QUARKUS_DATASOURCE_USERNAME=balaaca \
            -e QUARKUS_DATASOURCE_PASSWORD="$SMOKE_PASSWORD" \
            -e QUARKUS_FLYWAY_MIGRATE_AT_START=true \
            -e QUARKUS_OIDC_AUTH_SERVER_URL=http://kc:8080/realms/balaaca-test \
            "$IMAGE:${{ github.sha }}"
          timeout 120 sh -c \
            'until curl -sf localhost:8080/q/health/ready; do sleep 2; done' \
            || { docker logs api; exit 1; }
      - uses: aquasecurity/trivy-action@dc5a429b52fcf669ce959baa2c2dd26090d2a6c4 # v0.32.0
        with:
          image-ref: '${{ env.IMAGE }}:${{ github.sha }}'
          severity: 'HIGH,CRITICAL'
          ignore-unfixed: true          # rule 8: gate on what is actionable
          trivyignores: '.trivyignore'  # every waiver justified and expiring
          exit-code: '1'
      - uses: anchore/sbom-action@f8bdd1d8ac5e901a77a92f111440fdb1b593736b # v0.20.6
        with: { image: '${{ env.IMAGE }}:${{ github.sha }}' }
      - if: github.ref == 'refs/heads/main'
        run: |
          docker buildx build --platform linux/amd64,linux/arm64 \
            --push -t "$IMAGE:${{ github.sha }}" -t "$IMAGE:latest" .
```

`.trivyignore` — a waiver is a dated decision, not a hole:

```text
# libxml2 in the UBI-minimal base. No fixed RPM published upstream yet; the API
# never parses XML from an untrusted source. Re-check at the next base bump.
CVE-2025-XXXXX exp:2026-11-30
```

The Maven gates the chain relies on live in the parent `pom.xml`, so they also
fail a local `mvn verify`:

```xml
<!-- JaCoCo: coverage gate on domain/ and application/ PLUS the flat
     shared-kernel packages. Adapters and generated OpenAPI interfaces are
     excluded on purpose (rule 5). -->
<execution>
  <id>coverage-gate</id><goals><goal>check</goal></goals>
  <configuration>
    <includes>
      <include>com/balaaca/*/domain/**</include>
      <include>com/balaaca/*/application/**</include>
      <!-- shared-kernel is flat: no domain/ segment to match -->
      <include>com/balaaca/sharedkernel/money/**</include>
      <include>com/balaaca/sharedkernel/time/**</include>
      <include>com/balaaca/sharedkernel/logging/**</include>
    </includes>
    <rules><rule><limits>
      <limit><counter>LINE</counter><minimum>0.90</minimum></limit>
      <limit><counter>BRANCH</counter><minimum>0.85</minimum></limit>
    </limits></rule></rules>
  </configuration>
</execution>

<!-- PIT: mutation gate on the invariants that actually carry risk. The last
     three lines are the real targets: LocalWindows and Money live here. -->
<configuration>
  <targetClasses>
    <param>com.balaaca.scheduling.domain.*</param>
    <param>com.balaaca.booking.domain.*</param>
    <param>com.balaaca.sharedkernel.money.*</param>
    <param>com.balaaca.sharedkernel.time.*</param>
    <param>com.balaaca.sharedkernel.logging.*</param>
  </targetClasses>
  <mutationThreshold>80</mutationThreshold>
</configuration>
```

The interim guard on `main` and `develop`, since server-side protection is
unavailable (rules 13 and 14), is the `pre-push` hook in `branch-naming`. That
skill holds the single authoritative copy; this pipeline only assumes it exists
and never restates it.

## Sibling skills

- `branch-naming` — `develop` as integration branch and default, `main` as the release branch, and the one authoritative `pre-push` hook.
- `commit-style` — the house commit format, enforced by a local hook only and never by CI.
- `backend-tests` — the test levels and the coverage/mutation scoping this pipeline enforces.
- `contract-first` — the single OpenAPI document this build lints and diffs.
- `backend-architecture` — the ArchUnit rules the `verify` step runs.
- `booking-integrity` — the concurrency suites that must run against real PostgreSQL.
- `multi-tenant-rls` — the tenant non-leak and IDOR suites the pipeline blocks on.
- `money-currency` / `temporal-modelling` / `idempotency-concurrency` — the invariants behind the jqwik and PIT gates.
