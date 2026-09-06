---
name: ci-workflow
description: Use when editing .github/workflows/*.yml or a pom.xml gate (JaCoCo, PIT, ArchUnit, Semgrep, OSV-Scanner, Trivy, Syft, gitleaks), bootstrapping CI for a new module or satellite deployable, adding a waiver to osv-scanner.toml or .oasdiff-ignore, wiring the image smoke-boot or a deploy step, or debugging a pipeline that did not trigger, went red, or claims a gate this pipeline does not actually run.
---

# ci-workflow

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

GitHub Actions pipeline that mechanically enforces the Definition of Done across
the Quarkus modular monolith, the notification-worker satellite and the Next.js
front end. A change is not "done" until the pipeline is green: the secret scan
over full history, both Maven reactors with all their test levels and the
coverage and mutation gates, the front end's typecheck, tests, lint and build,
the published contract's lint and breaking-change check, the shell and compose
lint, the dependency scan, and the container images. No merge into `develop` -
and no promotion into `main` - without it, and since the repository went public
GitHub refuses the merge itself (rule 14).

## When to use

- Editing any `.github/workflows/*.yml` or a module `pom.xml` that changes a
  gate (JaCoCo, PIT, ArchUnit, Semgrep, OSV-Scanner, Trivy, Syft, gitleaks).
- Bootstrapping CI for a new bounded-context module (identity, providers,
  catalog, scheduling, booking, billing, shared-kernel) or a satellite
  deployable (notification-worker, chatbot-service).
- A push didn't trigger CI (usually a branch that doesn't match `branch-naming`)
  or a job is missing from the fan-out.
- Adding or renewing a waiver in `osv-scanner.toml` or `.oasdiff-ignore`.
- Being asked for a `.trivyignore`: there is no Trivy here, and rule 8 says why.
- Debugging a red pipeline before touching thresholds.

## The rules

1. **One pipeline shape, and every PR runs it - including the promotion PR.**
   `develop` is the integration branch and the GitHub default; `main` is the
   release branch and stays releasable. Feature branches are cut from `develop`
   and merged back into `develop` via a PR; `develop` is promoted to `main` at
   phase milestones through a PR as well (see `branch-naming`). The workflow
   therefore runs on `pull_request` targeting **`[develop, main]`** and on `push`
   to `develop` and to `main`. Restricting the `pull_request` trigger to
   `develop` alone leaves the one PR that ships code to users running no gate at
   all. Never commit straight to `main`.
2. **The jobs fan out from one gate; they are not a chain.** `secrets` runs
   first and everything waits on it, because a leaked credential is worse than a
   failing test and there is no point spending runner minutes on a commit that
   has to be rewritten anyway. Then `build`, `frontend`, `contract` and `lint`
   run in parallel off `secrets`, and `dependencies` and `images` hang off
   `lint`. Nothing is serialised behind the test suite, so a red front end and a
   red backend both surface on the same run instead of one hiding the other.
   `images` in particular does **not** wait for `build`, which is only safe
   because the images it builds are thrown away and nothing is pushed (rule 9).
   The day that job starts publishing, it has to `needs: build` first.
3. **Build = two Maven reactors, JDK 21, and you must run both.**
   `mvn -B -f backend/pom.xml verify` and then
   `mvn -B -f notification-worker/pom.xml verify`, on Temurin 21 with virtual
   threads enabled. The satellite is its own Maven project on purpose, outside
   the backend reactor, so a `verify` in `backend/` reaches none of it: a green
   backend proves nothing about the worker, and a single rootless `mvn verify`
   would silently skip it. Use `actions/setup-java` cache for `~/.m2`. Server
   interfaces and wire types are generated into `target/` during this step from
   the single hand-authored OpenAPI document in the `app` module, and the front
   end regenerates its own TypeScript types from that same file before it
   typechecks. Generated sources are **never committed**, so there is nothing to
   drift and no drift check to run; what CI does run is a spectral lint of the
   document and `oasdiff` against the copy on the base branch, which fails the
   build on a backward-incompatible change (see `contract-first`).
4. **All test levels run under one `mvn verify`, no mocked DB.** Unit plus
   integration (Testcontainers PostgreSQL 18, Redis, Keycloak - NEVER an
   in-memory or mocked database), jqwik property tests on Money arithmetic and
   slot calculation, ArchUnit rules, and the three mandatory suites: tenant
   non-leak, the IDOR/BOLA matrix, and booking concurrency (both the named-staff
   and the any-available-staff test). Testcontainers needs a Docker daemon on the
   runner; do not swap it for H2 to "speed up" CI - H2 has neither RLS nor
   `EXCLUDE USING gist`, so the suite would be green while the product is broken
   (see `backend-tests`).
5. **Coverage gate + mutation gate both block the merge, and neither is scoped
   the way you would guess.** JaCoCo's `check` runs at `verify` in
   **`backend/app` only** (`mvn` fails, not a report you read later): one
   `BUNDLE` rule, `INSTRUCTION` at `0.78`, reading `jacoco-quarkus.exec` and
   excluding `com/balaaca/app/api/**`. There is no `LINE` or `BRANCH` limit and
   no per-context include list; the parent `pom.xml` binds only `prepare-agent`,
   `merge` and `report`, so a per-module `check` does not exist. The gate lives
   in `app` because that is the only place the number means anything: Quarkus
   rewrites classes during augmentation, and a per-module exec file reads every
   adapter as 0% covered while the integration tests drive them on every
   request. The generated wire types are excluded because they moved the ratio
   from 83% to 50% the day the contract landed, without a single test having got
   worse. PIT is configured **per module**, with a different threshold in each:
   `scheduling` 68, `booking` 78, `shared-kernel` 50, targeting
   `scheduling.domain.*`, `booking.domain.*`, `sharedkernel.money.*` and
   `sharedkernel.phone.*`. Lowering either threshold to make a PR pass is
   forbidden; they only ratchet up.
   Earlier versions of this file pinned `com/balaaca/sharedkernel/{money,time,logging}/**`
   and a `LocalWindows` class. Do not add them back looking for something that
   was deleted: `sharedkernel.time` and `sharedkernel.logging` were never built,
   shared-kernel's packages are `error`, `ids`, `money` and `phone`, and the
   class is `LocalWindow`, singular, in `com.balaaca.scheduling.domain` - which
   the `scheduling.domain.*` target already covers.
6. **There is no static-analysis job, and this file used to claim one.**
   Earlier versions pinned Semgrep OSS against a ruleset committed at
   `.semgrep/`. Neither exists: `grep -rn semgrep .github/` finds nothing and
   there is no `.semgrep/` directory. It was never wired, not deleted by
   accident, so do not go hunting for the file somebody must have removed. What
   occupies this slot today is the ArchUnit suite inside `mvn verify` and the
   front end's `eslint`, and that is all. If Semgrep is ever added, add it
   keyless - `semgrep scan --config .semgrep/ --error`, never `semgrep ci` with
   a `SEMGREP_APP_TOKEN`: the App flow needs a hosted account, and a token that
   is absent on a fork or a fresh clone turns the gate into a silent no-op.
   **SonarQube is not used at all** and should not be: its quality gate requires
   a paid hosted instance. No `continue-on-error` on any job here.
7. **Security scans block, two of them, both keyless and both pinned by
   checksum.** gitleaks for secrets, run as its **MIT-licensed binary** rather
   than the action, which bills organisation accounts, and over the **full
   history** (`fetch-depth: 0`), because a secret removed in a later commit is
   still compromised. And **OSV-Scanner** for vulnerable dependencies, keyless,
   unlike OWASP Dependency-Check, which throttles to a multi-minute NVD warm-up
   without an API key and whose recent releases fail outright when the key is
   absent. Both are downloaded at run time and verified against a pinned SHA-256
   first: a tool fetched by a gate is a dependency of that gate. OSV-Scanner
   runs as that binary and **not** as `google/osv-scanner-action`, because the
   exit code needs handling the action does not expose - `127` means every
   finding matched a documented waiver, which is a pass, not a failure. It is
   also fed two CycloneDX SBOMs, one per reactor, rather than the poms: OSV
   resolves through the registry, no SNAPSHOT of this project is in Central, and
   resolution aborting on the first missing sibling once reported zero findings
   for a module carrying 52. **There is no Trivy and no Syft.** Earlier versions
   of this file promised an image scan and a Syft SBOM; neither was ever wired,
   and the `images` job builds three images without scanning one. Secrets never
   live in the repo - in CI they come from GitHub Actions repository secrets
   referenced by name, and at runtime from injected env or secret files on the
   deploy machine.
8. **Every waiver carries a reason and a date, and none of them is a
   `.trivyignore`.** This rule used to describe `ignore-unfixed: true`, a
   committed `.trivyignore` and a `ci/check-trivyignore.sh` lint step. None of
   the three exists, and the script and the `ci/` directory never did. The
   repository has two waiver files instead, and both are read by a gate that
   would otherwise be red. `osv-scanner.toml` holds the dependency waivers and
   is passed with `--config`; it currently holds **none**, and it survives empty
   rather than being deleted because it is where the rule about reasons and
   expiries is written down. `.oasdiff-ignore` holds the breaking changes
   accepted deliberately, one line per operation. Write those lines as a
   superset, never an excerpt: oasdiff checks that the ignore line contains the
   finding's whole rendered text, not that the finding contains the line, so a
   half-quoted waiver matches nothing and the gate stays red - which is the safe
   direction to fail. Waive the named finding rather than relaxing `--fail-on`,
   because a relaxed threshold waives every future breaking change along with
   today's. A waiver is a decision with a review date, never a permanent
   hole.
9. **Image = multi-stage, non-root, and CI builds it only to prove the recipe
   still works.** The `images` job builds all three - `api`, `worker`, `web` -
   with plain `docker build`, tags them `balaaca-<name>:ci`, and **pushes
   nothing**. No build action is used: buildx is already on the runner, and
   every action added here is another SHA to pin and another supply chain to
   trust for what two lines of shell already do. It builds `linux/amd64` only,
   deliberately: cross-building `arm64` means QEMU, which means a Maven reactor
   under emulation and a job measured in tens of minutes to prove what a native
   build proves in three. The image that actually ships is built natively on the
   machine that deploys it and pushed by hand to `ghcr.io/gyom15/balaaca-*` (see
   `docs/DEPLOYMENT.md`), which today is a Raspberry Pi and therefore
   `linux/arm64`. The runtime stage is `eclipse-temurin:21-jre` and **not**
   distroless, because the healthcheck reads `/q/health/ready` with `curl` and a
   base with no package manager cannot install it; what is not negotiable is
   that it runs as a non-root UID and that the multi-stage build layer is
   discarded.
10. **The image job boots each image, and today it proves only that the
    entrypoint starts.** Unit and integration tests run in the test profile, so
    a production-only configuration mistake - a required environment variable
    with no default, a missing OIDC URL - is invisible to every one of them and
    surfaces at deploy. This rule used to describe a full readiness boot; that
    boot is worth writing and is **not written**. What runs is smaller and says
    so out loud: `api` and `worker` are each started with no network, no
    database and no OIDC, are **expected to fail** (`|| true`), and the step
    passes only if the log names Quarkus. That proves the jar is findable and
    the entrypoint reaches the runtime - the API refusing at the database it
    cannot reach means it got that far. It does not prove the configuration is
    deployable, and nobody should read it as if it did. When the real boot is
    written, give it what production gives it: a **user-defined Docker network**
    (never the deprecated `--link`, which does not resolve on a modern daemon),
    a throwaway PostgreSQL with its five roles and
    `QUARKUS_DATASOURCE_USERNAME` / `QUARKUS_DATASOURCE_PASSWORD` matching it,
    `QUARKUS_FLYWAY_MIGRATE_AT_START=true` so the schema exists, and an
    **explicit test OIDC issuer** - a Keycloak container on the same network -
    because Quarkus OIDC resolves its discovery document at startup and fails
    without one. Then wait for `/q/health/ready`.
11. **Flyway migrations never run against a shared or production database from
    CI.** The real cluster migration is a deploy step. CI applies migrations in
    exactly one safe place today: against the Testcontainers PostgreSQL during
    integration tests, in both reactors. The smoke boot of rule 10 has no
    database at all, so it applies none; when it gets one, that throwaway
    container counts as safe too, because a container that exists for ninety
    seconds is not a database anyone can lose. What is forbidden is pointing
    `flyway:migrate` at a database somebody else is using.
12. **Pin every action to a 40-character commit SHA, never a tag.** A tag is
    mutable: its owner can silently repoint it, which is exactly how the
    `trivy-action` and `kics-github-action` supply-chain compromises worked.
    Write `uses: owner/action@<40-char-sha> # v7` so the version stays readable
    while the reference stays immutable. Nothing enforces this automatically -
    there is no Semgrep ruleset and no lint step for it (rule 6) - so it rests
    on review and on the comment at the top of `ci.yml` that says why. The same
    discipline covers the tools fetched by URL: gitleaks, oasdiff and
    osv-scanner are each checksummed before they run.
13. **Local hooks are the first filter on commit shape, they are bypassable,
    and one of them does less than its name suggests.** A `commit-msg` hook
    enforces the house commit format. A `pre-commit` hook runs gitleaks when the
    tool happens to be installed and is deliberately silent when it is not,
    because CI is the authority on secrets. A `pre-push` hook refuses a direct
    push to `main` or `develop` - and **it does not validate branch names**: it
    reads the push refs, matches `refs/heads/main` and `refs/heads/develop`, and
    lets any topic-branch name whatsoever through. Its message names the allowed
    prefixes in prose, which is guidance, not a check, so do not cite it as the
    thing that enforces `branch-naming`. `branch-naming` holds the one
    authoritative copy of that hook - do not restate a second, divergent version
    here or anywhere else. All of it is client-side and `--no-verify` walks past
    every line of it, which is why the two branches are also protected
    server-side (rule 14). CI does not lint the commit messages on a branch and
    does not verify signatures, so **do not document commit signing as an
    enforced gate** (see `commit-style`). What CI does do is **self-test the
    hook**: the `lint` job drives seven fixtures through `.githooks/commit-msg`
    - one that must be accepted and six that must be rejected - and fails the
    build if any verdict flips. The hook is the only thing enforcing the
    convention, so if it quietly stopped working nothing else would notice.
14. **Branch protection is live on both branches; document it and keep the
    required-checks list current.** This rule used to say the opposite, and it
    was true until 2026-08-29: server-side protection needs a paid plan on a
    **private** repository, and the interim measure was the `pre-push` hook. The
    repository was then made **public**, because a private repository on the
    free plan meters Actions minutes across the whole account and the pool ran
    out, which meant no CI and therefore no enforcement of anything. Protection
    came with that decision and is now on for `main` and `develop` both: a pull
    request is required, CI checks are required, force-push and deletion are
    refused, and `enforce_admins` is on, so the owner is bound like everybody
    else. A direct push is rejected with `GH006` even with `--no-verify`. So
    write the README to say `main` is protected, because it is; understating the
    enforcement is what invites somebody to go and re-open the gap. The
    `pre-push` hook is no longer the guarantee, only a faster error message. Two
    things still need watching: a new job is not a gate until it is added to the
    required-checks list on each branch, since adding it to `ci.yml` alone
    leaves it advisory, and signature verification is still off - do not claim
    commits are verified.
15. **Day-1 target is containers on one machine: a Raspberry Pi today, a VPS
    later.** `scripts/deploy.sh` pulls the commit-tagged image from `ghcr.io`
    and restarts the stack behind a health check (`/q/health/ready`, bounded
    retries), roles first and application second. The pipeline does not produce
    that image - it is built and pushed by hand from a development machine
    (rule 9) - so a commit that touched `backend/`, `frontend/` or `docker/` and
    was never rebuilt has no image to pull, and the deploy says so rather than
    serving old containers under new code. No Kubernetes and no Terraform until
    a concrete scaling need justifies them; don't add them to the pipeline
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
- `semgrep ci` with `SEMGREP_APP_TOKEN` -> rule 6; there is no Semgrep job
  today, and if one is added it runs `semgrep scan` against a committed local
  ruleset so the gate works with no account.
- `continue-on-error: true` on a test or scan job -> a real gate that never
  blocks; remove it, let the job fail the pipeline.
- H2, in-memory or mocked DB in integration tests to dodge Docker on the runner
  -> rule 4; a mocked database cannot enforce RLS or the exclusion constraint.
- Dropping the JaCoCo or PIT threshold in `pom.xml` to turn a red PR green ->
  fix or add tests; thresholds only ratchet up.
- Adding anything but the generated wire types to the JaCoCo `excludes` ->
  rule 5; the one exclusion is `com/balaaca/app/api/**`, and it is there because
  the generator wrote those getters, not because they are awkward to test.
- Moving the coverage `check` out of `backend/app`, or adding a per-module one
  -> rule 5; augmentation makes a per-module exec file read every adapter as 0%
  covered, so the number would be wrong in the direction that looks alarming.
- Adding `sharedkernel.time` or `sharedkernel.logging` to a gate pattern ->
  rule 5; those packages do not exist and never did. shared-kernel is `error`,
  `ids`, `money` and `phone`.
- An `osv-scanner.toml` entry with no reason and no expiry -> rule 8; it would
  outlive everyone who understood it. Delete a waiver nothing matches rather
  than renewing it: the scanner warns about an unused ignore for a reason.
- Widening `.oasdiff-ignore` by relaxing `--fail-on` instead of quoting the
  finding -> rule 8; that waives every future breaking change along with the one
  being accepted today.
- A `.oasdiff-ignore` line written as an excerpt of the finding -> rule 8; the
  match runs the other way round, so the line matches nothing and the gate stays
  red while everyone hunts for a syntax error.
- A dependency scanner that silently needs an API key -> it either throttles to
  uselessness or fails closed on a CI runner; pick a keyless one.
- The billed gitleaks action instead of the MIT binary -> rule 7.
- An action referenced by tag rather than a 40-character commit SHA -> rule 12.
- An action pinned to a major that still runs on the Node 20 runtime -> removed
  from GitHub-hosted runners on 2026-09-16; every action must be node24.
- Making the `images` job push without first giving it `needs: build` and a
  smoke boot that reaches readiness -> rules 2, 9 and 10; nothing ships out of
  CI today, which is the only reason those two gaps are affordable.
- `docker run --link pg` in the boot step -> rule 10; `--link` is deprecated and
  the container will not resolve the hostname. Create a network with
  `docker network create` and attach both containers to it.
- Writing the readiness boot with a JDBC URL but no
  `QUARKUS_DATASOURCE_USERNAME` / `_PASSWORD`, no
  `QUARKUS_FLYWAY_MIGRATE_AT_START` and no OIDC issuer -> rule 10; readiness can
  never turn green, and the timeout expiring is then the only thing the step
  ever proves.
- Reading the current smoke step as proof the image is deployable -> rule 10; it
  proves the entrypoint starts, and it asserts failure on purpose.
- Adding `linux/arm64` to the CI image build -> rule 9; QEMU turns a three-minute
  build into tens of minutes to produce an artefact that is thrown away. The
  arm64 image is built natively on the machine that runs it.
- `[skip ci]` on a "trivial" change -> the pipeline catches config and contract
  drift; never skip it.
- `flyway:migrate` pointed at a shared or production database from CI ->
  rule 11; a Testcontainers instance is fine and a throwaway smoke-boot
  container would be too, a database someone else uses is not.
- A second copy of the `pre-push` hook pasted into this file or a README ->
  rule 13; `branch-naming` owns it, and two copies drift.
- A document claiming commits are verified -> rule 13; nothing signs and
  nothing verifies. The `lint` job self-tests the `commit-msg` hook, which
  covers the message format and says nothing about a signature.
- Citing the `pre-push` hook as the thing that enforces branch naming -> rule
  13; it matches `main` and `develop` only and never looks at the name.
- Hardcoding a token in a workflow `env:` block -> reference a GitHub Actions
  secret by name; runtime secrets come from injected env or secret files on the
  deploy machine.
- A runtime stage running as root, or a single-stage Dockerfile -> rule 9; the
  base is `eclipse-temurin:21-jre` because the healthcheck needs `curl`, and
  non-root plus a discarded build layer is what makes that base acceptable.
- Adding a Kubernetes or Terraform deploy stage on day 1 -> rule 15; containers
  on one machine until a scaling need is proven.
- Deploying the `latest` tag -> pin the immutable git-SHA tag so the running
  version is unambiguous.
- A README or a skill asserting that `main` is unprotected, or that the
  `pre-push` hook is the only guard -> rule 14; both branches have been
  protected since 2026-08-29, and understating the enforcement is how somebody
  talks themselves into re-opening the gap.
- Adding a job to `ci.yml` and calling it a gate -> rule 14; it blocks nothing
  until it is on the required-checks list of both branches.

## Minimal correct example

`.github/workflows/ci.yml` - the real shape, secret scan first and then a fan-out:

```yaml
name: ci
on:
  pull_request:
    branches: [develop, main]   # the promotion PR is gated too (rule 1)
  push:
    branches: [develop, main]

permissions:
  contents: read                # least privilege: no job here writes anything

concurrency:                    # a superseded run is cost and a misleading status
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # Everything waits on this one, and only on this one (rule 2).
  secrets:
    name: secret scan
    runs-on: ubuntu-latest
    steps:
      # Every action is pinned to a 40-character commit SHA; the trailing
      # comment keeps the human-readable version visible (rule 12).
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          # gitleaks walks history: a secret removed in a later commit is still
          # compromised and must still fail the build.
          fetch-depth: 0
      - name: Run gitleaks
        env:
          GITLEAKS_VERSION: 8.30.1
          GITLEAKS_SHA256: 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
        run: |
          set -euo pipefail
          archive="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
          curl -sSfL --retry 3 -o "$archive" \
            "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${archive}"
          # A tool fetched by a gate is a dependency of that gate: pin it.
          echo "${GITLEAKS_SHA256}  ${archive}" | sha256sum -c -
          tar -xzf "$archive" gitleaks
          # --redact so a finding never prints the secret into a public log.
          ./gitleaks detect --source . --redact --exit-code 1 --verbose

  build:
    name: build and test
    needs: secrets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-java@dded0888837ed1f317902acf8a20df0ad188d165 # v5.0.0
        with: { distribution: temurin, java-version: '21', cache: maven }
      # verify, not test: the *IT suites run under Failsafe against a real
      # PostgreSQL through Testcontainers, and the runner supplies the socket.
      - run: mvn -B -f backend/pom.xml verify
      # TWO reactors (rule 3). The satellite is its own Maven project on
      # purpose, so the verify above does not reach a line of it.
      - run: mvn -B -f notification-worker/pom.xml verify

  frontend:
    name: frontend
    needs: secrets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      # ci, not install: it installs exactly the lockfile and fails if
      # package.json and the lock disagree.
      - run: npm ci
        working-directory: frontend
      # typecheck regenerates the API types from META-INF/openapi.yaml first, so
      # this is the drift check on the client side: a page reading a field the
      # document no longer publishes stops compiling here.
      - run: npm run typecheck
        working-directory: frontend
      - run: npm run test
        working-directory: frontend
      - run: npm run lint
        working-directory: frontend
      - run: npm run build
        working-directory: frontend

  contract:
    name: published contract
    needs: secrets
    runs-on: ubuntu-latest
    steps:
      # Full history: the breaking-change check needs the document already on
      # the base branch to compare against.
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { fetch-depth: 0 }
      # npm ci, not npx: package-lock.json pins spectral's whole tree by
      # integrity hash, and `npx --yes` resolved and executed it from the
      # registry on every run with no lockfile and no integrity check.
      - name: Lint the OpenAPI document
        run: |
          npm ci --ignore-scripts
          npm run lint:openapi
      - name: Check for breaking changes
        env:
          OASDIFF_VERSION: 1.29.1
          OASDIFF_SHA256: 541f7c66c933495fceef24eaf5c48aa66c19069f366f7bd0a60a6a4820c5e533
        run: |
          set -uo pipefail
          spec=backend/app/src/main/resources/META-INF/openapi.yaml
          # Nothing to compare against the first time the document appears, and
          # that is the base case, not a failure.
          if ! git show "origin/${{ github.base_ref || 'develop' }}:$spec" \
                 > /tmp/published.yaml 2>/dev/null; then
            echo "::notice::no published contract to compare against yet"
            exit 0
          fi
          archive="oasdiff_${OASDIFF_VERSION}_linux_amd64.tar.gz"
          curl -sSfL --retry 3 -o "$archive" \
            "https://github.com/oasdiff/oasdiff/releases/download/v${OASDIFF_VERSION}/${archive}"
          echo "${OASDIFF_SHA256}  ${archive}" | sha256sum -c -
          tar -xzf "$archive" oasdiff
          # --err-ignore, not a relaxed --fail-on: the waivers are named, dated
          # and quoted in .oasdiff-ignore (rule 8).
          ./oasdiff breaking /tmp/published.yaml "$spec" \
            --fail-on ERR --err-ignore .oasdiff-ignore

  lint:
    name: shell and compose
    needs: secrets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      # shellcheck ships on the runner image, so there is nothing to pin. The
      # hooks are POSIX sh, not bash, and are checked as such.
      - run: |
          shellcheck --severity=warning scripts/*.sh infrastructure/postgres/bootstrap.sh
          shellcheck --shell=sh --severity=warning .githooks/*
      # Two failures matter: a malformed compose file, and a variable compose
      # references but .env.example omits, which breaks a fresh clone silently
      # because compose only warns and substitutes "".
      - run: |
          cp .env.example .env
          warnings=$(docker compose config 2>&1 >/dev/null || true)
          printf '%s' "$warnings" | grep -q 'variable is not set' && exit 1
          docker compose config --quiet
      # Rule 13: the hook is the only thing enforcing the commit convention, so
      # CI checks the hook rather than the branch's messages.
      - name: Check the commit-msg hook still enforces the convention
        run: |
          set -euo pipefail
          tmp=$(mktemp -d)
          check() {
            printf '%s' "$2" > "$tmp/msg"
            if .githooks/commit-msg "$tmp/msg" >/dev/null 2>&1; then r=ACCEPT; else r=REJECT; fi
            [ "$r" = "$1" ] || { echo "::error::expected $1 for '$3'"; exit 1; }
          }
          check ACCEPT 'Add provider ownership guard'   'plain imperative'
          check REJECT 'Added provider ownership guard' 'past tense'
          check REJECT 'feat(booking): add guard'       'conventional prefix'
          # ...and four more: lowercase start, trailing period, over 50
          # characters, and a Co-Authored-By trailer.

  dependencies:
    name: vulnerable dependencies
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-java@dded0888837ed1f317902acf8a20df0ad188d165 # v5.0.0
        with: { distribution: temurin, java-version: '21', cache: maven }
      # Scanning the poms sees nothing and says so only on stderr: OSV resolves
      # through the registry, every backend module depends on sibling
      # com.balaaca artifacts, and no SNAPSHOT of this project is in Central.
      # Resolution aborts on the first missing sibling and drops the whole tree,
      # so a module with 52 known vulnerabilities once reported zero. An SBOM is
      # what Maven itself resolved, so there is nothing left to look up.
      - run: |
          mvn -B -f backend/pom.xml -DskipTests \
            org.cyclonedx:cyclonedx-maven-plugin:2.9.3:makeAggregateBom -DoutputFormat=json
          mvn -B -f notification-worker/pom.xml -DskipTests \
            org.cyclonedx:cyclonedx-maven-plugin:2.9.3:makeAggregateBom -DoutputFormat=json
      # The pinned binary and NOT google/osv-scanner-action: the action does not
      # expose the exit code this needs. 127 means every finding matched a
      # documented waiver, which is a pass. Through the action, every waived
      # finding turns the build red (rule 7).
      - name: Run OSV-Scanner
        env:
          OSV_VERSION: 2.5.1
          OSV_SHA256: f9f25499a2c8cc367b3af45df2ea7eeca7fbccceab9c35079968f4b3652194be
        run: |
          set -uo pipefail
          curl -sSfL --retry 3 -o osv-scanner \
            "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_linux_amd64"
          echo "${OSV_SHA256}  osv-scanner" | sha256sum -c -
          chmod +x osv-scanner
          scan() {
            code=0
            # `|| code=$?` and not a bare call: the step already runs under
            # `bash -e`, so a non-zero exit would abort before the case below.
            ./osv-scanner --config=osv-scanner.toml "$@" || code=$?
            case "$code" in
              0)   echo "no known vulnerabilities in $*" ;;
              127) echo "::notice::every finding in $* matched a waiver" ;;
              *)   echo "::error::osv-scanner failed with exit $code on $*"; exit "$code" ;;
            esac
          }
          scan --recursive --allow-no-lockfiles ./
          scan --sbom=backend/target/bom.json
          scan --sbom=notification-worker/target/bom.json

  images:
    name: container images
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      # Plain docker build, no action: buildx is already on the runner. amd64
      # only, and nothing is pushed - what this proves is that the recipes still
      # build, and the artefact is thrown away (rule 9).
      - name: Build the three images
        run: |
          set -euo pipefail
          for image in api worker web; do
            docker build -f "docker/$image.Dockerfile" -t "balaaca-$image:ci" .
          done
      # Rule 10: this is NOT a readiness check. With no database and no OIDC the
      # container must fail - the point is that it fails having started the JVM
      # and read its configuration, not on a missing class or an unreadable jar.
      - name: Each image starts far enough to name what it is missing
        run: |
          set -euo pipefail
          for image in api worker; do
            docker run --rm "balaaca-$image:ci" > "$image.log" 2>&1 || true
            if ! grep -q "Quarkus\|quarkus" "$image.log"; then
              echo "::error::balaaca-$image never reached Quarkus"
              tail -30 "$image.log"; exit 1
            fi
          done
```

`osv-scanner.toml` - a waiver is a dated decision, and an empty file is a
statement:

```toml
# Every entry carries a reason and an expiry: a waiver without a review date
# silently becomes permanent, which is how a real finding ends up ignored.
#
# There are none, and that is the point of saying so here rather than deleting
# the file. The one that existed was written when this job scanned pom.xml
# files and resolved a version Maven never actually uses; once the scan became
# SBOM-based it stopped matching, and the scanner began warning about an unused
# ignore. A waiver nothing matches is exactly what the paragraph above warns
# about, so it is gone rather than renewed.
```

The Maven gates the pipeline relies on live in the poms, so they also fail a local
`mvn verify`. The coverage gate is in `backend/app` and nowhere else:

```xml
<!-- backend/app/pom.xml. One BUNDLE rule on INSTRUCTION, reading the exec file
     the Quarkus extension writes. It is here and not per module because
     augmentation rewrites classes: a per-module exec file reads every adapter
     as 0% covered while 29 integration tests drive them (rule 5). -->
<execution>
  <id>coverage-gate</id>
  <phase>verify</phase><goals><goal>check</goal></goals>
  <configuration>
    <dataFile>${project.build.directory}/jacoco-quarkus.exec</dataFile>
    <!-- The wire types are generated from the contract, so their getters,
         equals and toString are the generator's work. Left in, they moved the
         ratio from 83% to 50% the day the contract landed, without a single
         test having got worse. -->
    <excludes><exclude>com/balaaca/app/api/**</exclude></excludes>
    <rules><rule>
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
    </rule></rules>
  </configuration>
</execution>
```

PIT is per module, and each threshold is the number that module earned, not one
figure imposed on all three:

```xml
<!-- backend/shared-kernel/pom.xml. scheduling is 68 on
     com.balaaca.scheduling.domain.* (where LocalWindow and SlotCalculator
     live) and booking is 78 on com.balaaca.booking.domain.*. -->
<configuration>
  <targetClasses>
    <param>com.balaaca.sharedkernel.money.*</param>
    <param>com.balaaca.sharedkernel.phone.*</param>
  </targetClasses>
  <targetTests><param>com.balaaca.sharedkernel.*</param></targetTests>
  <mutationThreshold>50</mutationThreshold>
</configuration>
```

`main` and `develop` are protected server-side (rule 14), and the `pre-push`
hook in `branch-naming` is the local, faster copy of the same refusal. That
skill holds the single authoritative version; this pipeline only assumes it
exists and never restates it.


## Sibling skills

- `branch-naming` - `develop` as integration branch and default, `main` as the release branch, and the one authoritative `pre-push` hook.
- `commit-style` - the house commit format, enforced by a local hook that CI self-tests but never applies to a branch's own messages.
- `backend-tests` - the test levels and the coverage/mutation scoping this pipeline enforces.
- `contract-first` - the single OpenAPI document this build lints and diffs.
- `backend-architecture` - the ArchUnit rules the `verify` step runs.
- `booking-integrity` - the concurrency suites that must run against real PostgreSQL.
- `multi-tenant-rls` - the tenant non-leak and IDOR suites the pipeline blocks on.
- `money-currency` / `temporal-modelling` / `idempotency-concurrency` - the invariants behind the jqwik and PIT gates.
