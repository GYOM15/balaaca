---
name: commit-style
description: Balaaca's house commit convention. Use when drafting a commit message, splitting a change into commits before a PR, reviewing a branch's history, configuring commitlint or a commit-msg hook, or when a message reaches for a Conventional Commits type/scope prefix, a past-tense subject, a trailing period, an emoji, or a Co-Authored-By trailer.
---

# commit-style

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

How commit messages must look on Balaaca. This mirrors the owner's established
convention - **plain imperative, capitalized, <= 50-char subject** - NOT the
Conventional Commits `type(scope):` shape. Commits are **signed** and **never**
carry a co-author trailer.

## When to use

- Drafting any commit message before `git commit`.
- Splitting a change into commits before opening a PR.
- Reviewing a branch's history.
- Configuring commitlint, a `commit-msg` hook, or local signing.
- The user asks for a commit suggestion.

## The rules

1. **Subject <= 50 characters.** Hard limit - phrase tightly, drop articles if
   needed.
2. **Start with a capital letter and a present-tense verb.** "Add", "Fix",
   "Update", "Remove", "Refactor", "Harden" - never "Added", "Adds", "Adding".
   The subject reads as a command completing "this commit will ...".
3. **No `type(scope):` prefix.** Plain imperative - no `feat:`, no `fix(...)`,
   no scope segment. This is deliberately NOT Conventional Commits.
4. **No trailing period.** The subject ends on its last word.
5. **Body (optional), <= 72 characters per line.** Explain *why*, not *what* - the diff already shows what. Separate it from the subject with one blank
   line; reference the ADR when the change follows one.
6. **Commits are signed, and signing is enforced locally only.** Sign every
   commit: `git commit -S`, or set `commit.gpgsign=true` once for the clone.
   Be honest about what enforces it - **nothing server-side does**. GitHub
   branch protection and required signature checks are unavailable on a private
   repository without a paid plan, and the CI gate (`ci-workflow`) runs no
   signature check. The only guard is client-side: local `commit-msg` /
   `pre-commit` hooks plus this convention, all bypassable with `--no-verify`
   or by a fresh clone that never installed the hooks. Treat signing as a
   discipline the team keeps, not a barrier the platform holds, until the
   repository is public or the plan changes.
7. **Never a `Co-Authored-By:` trailer.** Even when an AI assistant wrote the
   change, do not add co-author lines. Strict house rule.
8. **One logical change per commit.** If the subject needs "and", split it.
9. **English** for subject and body (see `code-language`). User-facing French
   lives in the i18n catalogue, never in a commit message.
10. **Breaking API/contract changes** are called out in the body (a
    `BREAKING CHANGE:` note) - the hand-authored OpenAPI document is the seam
    other code depends on, and a published error code is never renamed.
11. **No emoji, anywhere in the message.** Subject, body, and trailers stay
    plain text.

## Anti-patterns

- `feat(booking): Add idempotency key` -> rule 3 (no type/scope prefix here).
- `Added idempotency key.` -> rule 2 (past tense) + rule 4 (trailing period).
- `Add idempotency key and freeze price and fix RLS` -> rule 1 (too long) +
  rule 8 (three changes).
- `Co-Authored-By: Claude <noreply@anthropic.com>` -> rule 7.
- `Fix slot overlap :rocket:` or any pictogram -> rule 11.
- An unsigned commit -> rule 6. Note precisely what happens: nothing rejects it
  automatically. It merges, and the history carries an unverified commit for
  good. That is why the rule is a discipline and the hook is installed on every
  clone.
- Claiming in a doc, a PR description, or a skill file that unsigned commits are
  "blocked at the gate" -> rule 6. There is no server-side check; writing that
  there is creates a false sense of enforcement, which is worse than none.
- A subject that names the file instead of the behaviour, such as
  `Update AppointmentService` -> rule 2, say what it does.

## Minimal correct example

```
Add exclusion constraint on appointments

Let PostgreSQL own the anti-double-booking invariant: an EXCLUDE
USING gist on (provider_id, staff_id, blocked_range) filtered to
PENDING and CONFIRMED. Application-side checking cannot survive
concurrent inserts, and no Redis or advisory lock is used for slot
exclusion. SQLSTATE 23P01 now maps to 409 SLOT_UNAVAILABLE.
See ADR-009.
```

Subject: capital, present-tense verb, no prefix, no period, <= 50 characters.

Further Balaaca-shaped subjects, all within the limit:

```
Resolve tenant from provider_staff, not the JWT
Bind app.provider_id on the pooled connection
Freeze service price onto the appointment
Drain notifications with SKIP LOCKED
Derive phone region from the provider country
Run slot tests under Europe/Paris as well
Retry any-staff booking on 23P01
```

### Heredoc helper

For multi-line bodies via the Bash tool, use a quoted heredoc and sign:

```bash
git commit -S -m "$(cat <<'EOF'
Freeze service price onto the appointment

Snapshot the amount the customer owes at booking time so a later
price change on the service offering never mutates a past
appointment. The columns are customer_price_amount_minor and
customer_price_currency, named for what they mean, leaving room to
add a platform fee additively later.
EOF
)"
```

### Local enforcement, installed per clone

Signing and the subject rules are held by hooks each developer installs. Keep
them in a tracked `.githooks/` directory and point Git at it, so a fresh clone
is one command away from being guarded:

```bash
git config core.hooksPath .githooks
git config commit.gpgsign true
```

`.githooks/commit-msg`, client-side and bypassable with `--no-verify`:

```bash
#!/usr/bin/env bash
# Client-side only. No server-side equivalent exists on a private repo
# without a paid plan; see rule 6.
subject=$(head -n 1 "$1")
[ "${#subject}" -le 50 ] || { echo "Subject exceeds 50 characters."; exit 1; }
case "$subject" in
  *.) echo "Subject must not end with a period."; exit 1 ;;
esac
printf '%s' "$subject" | grep -Eq '^[A-Z][a-z]+ ' \
  || { echo "Subject must start with a capitalized imperative verb."; exit 1; }
printf '%s' "$subject" | grep -Eq '^(feat|fix|chore|docs|refactor|test|ci)(\(|:)' \
  && { echo "No Conventional Commits type/scope prefix; see commit-style."; exit 1; }
grep -qi '^Co-Authored-By:' "$1" \
  && { echo "Co-Authored-By trailers are not used on this project."; exit 1; }
exit 0
```

## Note on commitlint

If commitlint is introduced, its DEFAULT preset enforces Conventional Commits - which this convention does NOT use. Configure it to THESE rules instead
(`subject-case: sentence-case`, `header-max-length: 50`, `type-enum` disabled,
`subject-full-stop` off, `body-max-line-length: 72`), or skip the dependency
entirely and enforce the subject rules with the local `commit-msg` hook above. A
hook is the lighter option here and matches the `pre-push` guard that
`branch-naming` owns.

Either way the enforcement stays **client-side**. commitlint installed as a hook
is as bypassable as the shell script; running it in CI would only report on
commits that already exist, and the CI gate as specified in `ci-workflow` does
not check messages or signatures at all. Do not describe these checks as a gate.
When the repository becomes public, or the plan changes, add required signature
verification and a commit-message check to branch protection, and update this
section then - not before.

## Sibling skills

- `branch-naming` - the `feature/<slug>` branch these commits live on, and the single authoritative `pre-push` hook.
- `ci-workflow` - the keyless gate, which checks build, tests and scans; it does not check signatures or messages.
- `code-language` - English for subject and body.
