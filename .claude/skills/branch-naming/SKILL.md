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
> no contradiction left to resolve — the older trunk-based rule is dead here.

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
2. **`develop` is the integration branch and the GitHub default branch.** Every
   topic branch is cut from `develop` and merged back into `develop` through a
   PR. A clone of the repository lands on `develop`, and a PR opened without
   thinking targets `develop` — that is the point of making it the default.
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
   (`shared-kernel`, `identity`, `providers`, `catalog`, `scheduling`,
   `booking`, `billing`) or a satellite (`notification-worker`,
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
   concurrency and tenant non-leak suites, ArchUnit, Semgrep, gitleaks,
   OSV-Scanner, Trivy, coverage and mutation thresholds — all pass before merge
   (see `ci-workflow`). A red gate never merges, not into `develop` and
   certainly not into `main`. Commits are signed as a matter of discipline
   (`commit-style`); the gate does not verify signatures, so do not lean on it
   for that.
10. **`develop` is promoted to `main` at phase milestones**, not per feature.
    The promotion is a PR from `develop` to `main` that runs the same gate, and
    the resulting `main` commit is what gets tagged and released. Because the
    promotion PR targets `main`, the workflow's `pull_request` trigger must
    list **both** `develop` and `main` — a gate that only fires on PRs into
    `develop` would let the release merge through unchecked.
11. **The `pre-push` hook guards both `main` and `develop`.** Not `main` alone:
    `develop` is where every feature integrates, so an accidental direct push
    there skips the gate on real work just as surely. The hook has exactly one
    documented override, for the milestone promotion (rule 12).
12. **The override is explicit, deliberate, and per-command.** When a milestone
    promotion genuinely cannot go through a PR — the merge is done locally and
    the result must reach `main` — set the escape hatch on that single command:
    `BALAACA_PROMOTE=1 git push origin main`. Never export it in a shell
    profile, never in CI, and never for a feature branch. Record the promotion
    in the release notes so the direct push is accounted for. `--no-verify` is
    not the override: it disables every hook silently and leaves no trace of
    intent.

## Enforcement, honestly

GitHub server-side branch protection is **not available on a private repository
without a paid plan**. Until the repository is public or the plan changes, the
interim guard is the **local `pre-push` hook** below. It is client-side and
therefore bypassable (`--no-verify`, `BALAACA_PROMOTE=1` used carelessly, or a
fresh clone that never pointed `core.hooksPath` at the tracked directory). Treat
it as a guardrail against mistakes, never as a security control.

The CI gate is the real barrier, and it is only a barrier for work that opens a
PR: a branch pushed straight past the hook and merged locally never gets one.
That gap is accepted knowingly, and it closes the day branch protection becomes
available.

## Anti-patterns

- Pushing straight to `develop` or `main` -> rules 1/2/11, bypasses the gate.
- A `pre-push` hook that protects only `main` -> rule 11; `develop` carries
  every feature merge and needs the same guard.
- Using `--no-verify` to land a promotion -> rule 12; use the named override so
  the intent is visible, or open the promotion PR.
- Exporting `BALAACA_PROMOTE=1` in `.zshrc` -> rule 12, that turns a one-command
  escape hatch into a permanently disabled hook.
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
- Describing the hook as protection -> "Enforcement, honestly"; it stops a
  slip of the fingers, nothing more.

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

```bash
#!/usr/bin/env bash
# .githooks/pre-push — the single authoritative copy for this project.
#
# Client-side only and bypassable (--no-verify, or a clone that never set
# core.hooksPath). GitHub branch protection is unavailable on a private repo
# without a paid plan; the CI gate on the PR is the real barrier. This only
# stops an accidental direct push to an integration or release branch.
#
# Guards BOTH refs/heads/develop and refs/heads/main. The one documented
# override is the milestone promotion of develop into main:
#
#     BALAACA_PROMOTE=1 git push origin main
#
# Set it on that single command only — never exported, never in CI, never for
# a feature branch — and note the promotion in the release notes.
set -euo pipefail

protected='refs/heads/main refs/heads/develop'

while read -r _local_ref _local_sha remote_ref _remote_sha; do
  for ref in $protected; do
    [ "$remote_ref" = "$ref" ] || continue
    branch=${remote_ref#refs/heads/}

    if [ "$remote_ref" = 'refs/heads/main' ] && [ "${BALAACA_PROMOTE:-0}" = '1' ]; then
      echo "pre-push: milestone promotion to main, override acknowledged."
      continue
    fi

    echo "pre-push: direct push to '${branch}' is not allowed; open a PR."
    echo "pre-push: promoting develop to main? re-run with BALAACA_PROMOTE=1."
    exit 1
  done
done

exit 0
```

The override deliberately covers `main` only. There is no promotion into
`develop`, so a direct push there is always a mistake and always refused.

## Sibling skills

- `commit-style` — signed commit messages on these branches: capitalized present-tense imperative subject <=50 chars, body <=72, no type/scope prefix, no Co-Authored-By; enforced by local hooks only.
- `ci-workflow` — the keyless gate every PR to `develop` and every promotion PR to `main` must pass; it cross-references the hook above rather than restating it.
