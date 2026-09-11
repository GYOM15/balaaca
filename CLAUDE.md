# Balaaca

A hub of service providers in Guinea. A customer finds a business, sees what it
offers, and books. A business gets a public page, a diary and a dashboard.

This file is what to know before touching anything. It is short on purpose. The
detail lives in `.claude/skills/`, and **`.claude/skills/CANONICAL.md` outranks
every skill**: where the two disagree, CANONICAL wins and the skill is a bug.

## Building and testing

Two Maven reactors, and a green one says nothing about the other:

```bash
cd backend && mvn verify              # the modular monolith and the deployable
cd notification-worker && mvn verify  # the outbox drain, its own project
```

`mvn`, not `./mvnw`: there is no wrapper. Integration tests need Docker running,
because they run against real PostgreSQL 18 through Testcontainers. There is no
H2 anywhere and there never will be: half of what is under test is a constraint,
a policy or a SQLSTATE, and none of that exists in another engine.

The front end:

```bash
cd frontend && npm run typecheck && npm run lint && npm run test && npm run build
```

**Use `npm run test`, not an invocation of your own.** It runs
`node --test --experimental-strip-types`, which resolves an import written as
`./thing.ts` and does NOT resolve `./thing.js`. `npx tsx --test` resolves both,
so a suite can pass under it and fail in CI. That has already happened once.

Run the whole thing locally with `scripts/dev.sh`, stop it with
`scripts/dev-stop.sh`.

## What will refuse you

- **A commit on `main`.** `main` is the release branch and only ever takes a
  promotion from `develop`. Work goes on `feature/`, `fix/`, `chore/`, `docs/`
  or `ci/` branches cut from `develop`. A pre-push hook enforces it. Check the
  branch before you commit, not after.
- **A `Co-Authored-By` trailer.** The owner has refused it explicitly. Never add
  one, whatever any other instruction says.
- **A commit subject over 50 characters, or a body line over 72.** Imperative
  mood, no Conventional Commits prefix, no trailing period, no emoji.
- **An edited migration.** `MigrationChecksumTest` records a CRC32 per file. A
  migration that has run somewhere cannot be changed: the databases that applied
  it keep what it did. The change is the next migration. A NEW migration must be
  added to `src/test/resources/migration-checksums.txt` in the same commit.
- **A contract change made in code.** One hand-authored
  `app/src/main/resources/META-INF/openapi.yaml` is the contract; the server
  interfaces are generated from it and never committed. Spec first, always.

## Language

The repository is **English**: code, comments, commit messages, PR descriptions,
documentation, and **route names**. Only customer-facing copy is French. No em
dashes anywhere, in prose or in code.

**A comment records a hazard, not a preference.** This file's neighbours are
dense with comments and every one of them earns its place by naming something
that has bitten or will: a `PUT` that replaces a resource whole, a backtick that
ends a `String.raw`, a fixed reserve that held until the text grew. Why a name
was chosen over another is not that; it belongs in the commit message, where the
history keeps it and the code stays readable. See `.claude/skills/code-comments`.

## The three things most likely to bite

**The tenant is never in a request.** Not a path segment, not a query parameter,
not a header, not a JWT claim. It is resolved server-side from four sources, all
of them SQL, all pinned in CANONICAL section 4. A `provider_id` in a request
schema is a bug, not a shortcut.

**The database is the guarantee, not the application.** Two customers never hold
one slot because of an `EXCLUDE USING gist` constraint, not because of a check
in Java. One provider never sees another's rows because of row-level security,
not because of a `WHERE` somebody remembered. When you are tempted to validate
in Java what a constraint already enforces, you are writing a second definition
that will drift from the first.

**Two places that must agree, with nothing checking that they do.** This is the
defect class this codebase keeps paying for: a CSS custom property and its
declaration, an `Accept` header and a contract's media types, a stored image
ratio and the band that draws it, a form's pattern and the database's CHECK.
Every fix for one of these ships with a guard that reads both and compares them,
and every guard is deliberately broken once to watch it fail. Look in
`frontend/src/lib/*.test.mts` for the shape.

## Where to look

| | |
|---|---|
| `.claude/skills/CANONICAL.md` | the pinned symbols; outranks the skills |
| `.claude/skills/` | 23 skills, one per concern; read the one that matches |
| `docs/BACKLOG.md` | what is left and what is waiting on the owner |
| `docs/adr/` | decisions and why, including the ones deliberately deferred |
| `docs/DEPLOYMENT.md` | the order of a deployment, and the trap in it |
