# ADR-0006 - `main` + `develop` + feature branches

Status: Accepted
Reverses rule 5 of the inherited `branch-naming` skill.

## Context

The inherited convention pack mandates trunk-based development: a single
protected `main` branch, and it explicitly lists a long-lived `develop` branch as
an anti-pattern.

The project owner asked for the opposite: feature branches, and a development
branch to push to continuously.

## Decision

- `main`: the release branch, always shippable.
- `develop`: the integration branch, and the GitHub repository's default branch,
  so that a pull request targets `develop` with no special action.
- `feature/<kebab-slug>`, plus `fix/`, `chore/`, `docs/`, `ci/`.
- A branch is cut from `develop` and returns to it through a pull request.
- `develop` is promoted to `main` at phase milestones.

The rest of the skill stands: kebab-case only, no personal prefix, one subject
per branch, a short lifetime, and merging only on a green gate.

This reversal is recorded here so that no reader is left facing two contradictory
rules without knowing which is authoritative. This ADR is.

## Consequences

Positive: `main` only ever receives states promoted deliberately. The model
matches the way the owner works.

Negative: `develop` can drift from `main` if promotion is irregular, which is
exactly the risk trunk-based development avoids. Frequent-promotion discipline
replaces the structural guarantee.

**A real limit**: server-side branch protection is unavailable. GitHub reserves
it for public repositories or paid accounts, and the repository is private on a
free account. `main` is therefore guarded only by the local `.githooks/pre-push`
hook, which `--no-verify` bypasses, and no CI check can be made required. It is a
convention, not a guarantee, and this ADR says so rather than letting anyone
believe otherwise.

## Revisit when

The repository goes public or the account moves to a paid plan: branch protection
and required checks then become available, and they should be turned on
immediately.
