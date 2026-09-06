---
name: branch-naming
description: Balaaca's two-branch Git model and the single authoritative pre-push hook. Use when cutting a branch, naming a feature/fix/chore/docs/ci branch, deciding which branch a PR targets, promoting develop to main at a milestone, installing or editing the pre-push guard, or when someone assumes trunk-based development with a single protected main.
---

# branch-naming

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Git branching on Balaaca uses **two permanent branches**: `main` is the
release branch and stays always releasable, `develop` is the integration
branch and the GitHub default. Everything else is a short-lived topic branch
cut from `develop`, merged back into `develop` by PR, and deleted.

> **This reverses the inherited rule.** The pack this project descends from
> mandated trunk-based development with a single protected `main` and listed
> `develop` as an anti-pattern. The Balaaca owner has explicitly decided
> otherwise: `develop` exists, it is the default branch, and it is promoted to
> `main` at phase milestones. Where the two disagree, this file wins. There is
> no contradiction left to resolve - the older trunk-based rule is dead here.

This file owns **the** `pre-push` hook. It is written once, below; `ci-workflow`
and `commit-style` cross-reference it rather than restating it. If you find a
second copy anywhere in the pack, delete that copy and point at this one.

## When to use

- Creating a new branch (`git switch -c ...`).
- Picking a name when starting a feature, fix, or chore.
- Deciding which branch a PR targets and when it may merge.
- Promoting integrated work to a release at a phase milestone.
- Installing, editing, or reasoning about the `pre-push` guard.

## The rules

1. **`main` is the release branch.** It is what is deployed. Nothing lands on
   it except a promotion from `develop` at a phase milestone. `main` is always
   releasable; if it is red, that outranks whatever feature is in flight.
2. **`develop` is the integration branch.** Every topic branch is cut from
   `develop` and merged back into `develop` through a PR. It is *not* the GitHub
   default branch, whatever a stale `origin/HEAD` in an old clone says: the
   repository reports `main`. So a fresh clone lands on `main`, and a PR opened
   without thinking targets `main`. Switch to `develop` before you cut anything,
   and read the base of every PR before you open it. The default will not do it
   for you, and a topic branch based on `main` merges stale.
3. **Short-lived topic branches: `feature/<kebab-slug>`.** Branch off the latest
   `develop`, do one topic, open a PR, merge, delete. Lifetime is days, not
   weeks. Examples: `feature/appointment-exclusion-constraint`,
   `feature/slot-calculation-buffers`, `feature/provider-public-slug`.
4. **`fix/`, `chore/`, `docs/`, `ci/` for the rest.** The prefix states what
   kind of work the branch carries, so intent is legible from the name alone:
   `fix/rls-tenant-leak-on-appointment-read`, `chore/bump-testcontainers`,
   `docs/booking-error-code-catalogue`, `ci/pin-actions-to-sha`.
5. **Optionally scope the slug by bounded context.** For clarity you may prefix
   the topic with its context: `feature/scheduling-dst-slot-tests`,
   `feature/billing-plan-entitlements`. Use one of the closed context list
   (`shared-kernel`, `platform-kernel`, `identity`, `providers`, `catalog`,
   `scheduling`, `booking`, `billing`) or a satellite (`notification-worker`,
   `chatbot-service`).
6. **Kebab-case only.** No `camelCase`, no `snake_case`, no spaces, no dots.
   `feature/availabilityRule` -> `feature/availability-rule`.
7. **No personal prefixes.** Never `guyolivier/foo` or `claude/bar`. The branch
   is named for the work, not for who or what typed it.
8. **One topic per branch.** If a branch grows a second unrelated change, cut a
   new branch from `develop`. A branch that cannot merge cleanly and quickly is
   too big. No long-lived per-module `catalog-dev` / `booking-v1` lines: those
   are parallel integration branches, and this project has exactly one.
9. **Merge only on a green gate.** Build, all test levels including the booking
   concurrency and tenant non-leak suites, ArchUnit, gitleaks, OSV-Scanner,
   coverage and mutation thresholds - all pass before merge (see `ci-workflow`).
   Semgrep and Trivy are **not** in that list and never were: no such step
   exists in `.github/workflows/ci.yml`, there is no `.semgrep/` directory and
   no `.trivyignore`. They came from the pack this project descends from, and
   naming them here made the gate read broader than it is. Do not go looking for
   them, and do not add a `.trivyignore` for a scanner that never runs. A red
   gate never merges into `develop`, where six of the seven jobs are required
   status checks. `main` is the weaker of the two: only `secret scan`, `shell
   and compose` and `vulnerable dependencies` are required there, so a promotion
   PR can go green enough to merge with `build and test` red. On a promotion,
   read the run; the merge button is not proof. Commits are signed as a matter
   of discipline (`commit-style`); the gate does not verify signatures, so do
   not lean on it for that.
10. **`develop` is promoted to `main` at phase milestones**, not per feature.
    The promotion is a PR from `develop` to `main` that runs the same gate, and
    the resulting `main` commit is what gets tagged and released. Because the
    promotion PR targets `main`, the workflow's `pull_request` trigger must
    list **both** `develop` and `main` - a gate that only fires on PRs into
    `develop` would let the release merge through unchecked.
11. **The `pre-push` hook guards both `main` and `develop`.** Not `main` alone:
    `develop` is where every feature integrates, so an accidental direct push
    there skips the gate on real work just as surely. It refuses both without
    exception, and rule 12 says why the exception it used to document is gone.
12. **There is no override, and its absence is the decision.** This file used to
    document `BALAACA_PROMOTE=1 git push origin main` as a per-command escape
    hatch for a milestone promotion done locally. The tracked hook reads no such
    variable, and it reads no `ALLOW_MAIN_PUSH=1` either, which is the name its
    own comment records for the version that once did. Nothing was deleted by
    accident. Both names were written when nothing protected `main`; GitHub now
    refuses a direct push server-side with `GH006` whatever the environment
    says, so an override would buy a local success followed immediately by a
    remote rejection, and a documented path that cannot work is worse than no
    path at all. A milestone promotion goes through a PR from `develop` to
    `main`, like everything else. `--no-verify` is not a way round it either: it
    silences every hook, leaves no trace of intent, and the server rejects the
    push all the same.

## Enforcement, honestly

This section used to say that server-side branch protection was unavailable on a
private repository without a paid plan, and that the local hook was the interim
guard. Both halves are dead. The repository is **public**, and `main` and
`develop` are **both protected server-side**: a pull request is required,
required status checks must be green, force-push and deletion are refused, and
`enforce_admins` is on, so the owner is bound like everybody else. A direct push
comes back `GH006`, with or without `--no-verify`.

So the `pre-push` hook below is not the guarantee, and never claim it is. What it
buys is speed and a better sentence: it refuses before the network round-trip and
names the PR you should have opened, instead of leaving you to decode a `GH006`.
It is still client-side and still bypassable - `--no-verify`, or a fresh clone
that never pointed `core.hooksPath` at the tracked directory - and that no longer
costs anything, because getting past the hook only gets you as far as the server.

The gap this section used to admit, a branch merged locally and pushed straight
past the hook so that no PR and no gate ever saw it, is closed. One honest caveat
survives: "protected" is not "the whole pipeline was green". The two branches
require different checks (rule 9), and `main` requires the fewer.

## Anti-patterns

- Pushing straight to `develop` or `main` -> rules 1/2/11, bypasses the gate.
- A `pre-push` hook that protects only `main` -> rule 11; `develop` carries
  every feature merge and needs the same guard.
- Using `--no-verify` to land a promotion -> rule 12; the hook goes quiet and
  the server still answers `GH006`. Open the promotion PR.
- Adding an override variable back to the hook -> rule 12; it was removed on
  purpose and it cannot work against a protected branch.
- A `feature/*` branch cut from `main` instead of `develop` -> rule 3; it will
  merge stale or drag a release commit back into integration.
- A PR from `feature/*` targeting `main` -> rule 2, topic work integrates in
  `develop` first.
- A workflow whose only `pull_request` trigger is `develop` -> rule 10, the
  promotion PR into `main` then merges without a gate.
- `feature` (bare word), `dev`, `wip`, `tmp`, `test` -> rule 3, carry a topic
  slug; rename before pushing.
- `booking-dev`, `catalog-v1-dev` (a second long-lived integration line) ->
  rule 8.
- `feature/AvailabilityRule` or `feature/availability_rule` -> rule 6.
- `claude/fix-slot-overlap` -> rule 7, no personal prefix.
- A branch open three weeks accumulating five topics -> rules 3/8, split it.
- Promoting `develop` to `main` by force-push -> rule 10; the promotion runs
  the gate like anything else.
- Describing the hook as the protection -> "Enforcement, honestly"; it stops a
  slip of the fingers and saves a round-trip. The protection is GitHub's, on
  both branches.

## Minimal correct example

```bash
# Start from fresh integration, one topic, context-scoped slug.
git switch develop
git pull --ff-only
git switch -c feature/booking-exclusion-constraint

# ... work, signed commits (capitalized imperative subject, no type prefix) ...
git push -u origin feature/booking-exclusion-constraint
# open PR -> base develop -> green gate -> merge -> delete branch
git push origin --delete feature/booking-exclusion-constraint

# At a phase milestone, promote integration to release.
git switch develop
git pull --ff-only
gh pr create --base main --head develop --title "Promote develop to main"
# green gate -> merge -> tag the resulting main commit
```

### The authoritative `pre-push` hook

Keep it tracked at `.githooks/pre-push` so a clone is one command from being
guarded, and point Git at the directory (the same `core.hooksPath` that carries
the `commit-msg` hook from `commit-style`):

```bash
git config core.hooksPath .githooks
```

This is the tracked file verbatim. It is POSIX `sh`, not bash, and it must stay
that way: CI shellchecks it with `--shell=sh --severity=warning`, and `shell and
compose` is a required status check on both branches. A `#!/usr/bin/env bash`
copy with `set -euo pipefail` - which this file used to print - fails that job.

```sh
#!/bin/sh
# Fast local feedback on the two branches that only ever advance through a
# merged pull request. GitHub enforces this server-side (protected branches,
# required status checks, enforce_admins), so this hook does not provide the
# guarantee - it just saves a network round-trip and a confusing GH006.
#
# There is deliberately no override. An earlier version offered
# ALLOW_MAIN_PUSH=1 as a milestone-promotion escape hatch; that was written
# when nothing protected main, and the server now refuses it regardless. A
# documented path that cannot work is worse than no path at all.

while read -r _local_ref _local_sha remote_ref _remote_sha; do
    case "$remote_ref" in
        refs/heads/main)
            printf 'pre-push: main only advances by merging a pull request.\n' >&2
            printf '  Promote a milestone with:\n' >&2
            printf '    gh pr create --base main --head develop\n' >&2
            printf '  The same three checks run on it.\n' >&2
            exit 1
            ;;
        refs/heads/develop)
            printf 'pre-push: develop only advances by merging a pull request.\n' >&2
            printf '  Open one from a feature/, fix/, chore/, docs/ or ci/ branch:\n' >&2
            printf '    gh pr create --base develop\n' >&2
            exit 1
            ;;
    esac
done

exit 0
```

Both arms of the `case` exit 1 unconditionally: no environment variable, no
argument and no branch of the code lets a push through. There is no promotion
into `develop` and no longer a local promotion into `main`, so a direct push to
either is always a mistake, and the hook says so in the shape of the command you
should have run instead.

## Sibling skills

- `commit-style` - signed commit messages on these branches: capitalized present-tense imperative subject <=50 chars, body <=72, no type/scope prefix, no Co-Authored-By; enforced by local hooks only.
- `ci-workflow` - the keyless gate every PR to `develop` and every promotion PR to `main` must pass; it cross-references the hook above rather than restating it.
