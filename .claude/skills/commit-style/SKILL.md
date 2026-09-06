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
5. **Body (optional), <= 72 characters per line.** This is not just taste: the
   `commit-msg` hook fails the commit on any line after the second that is
   longer, and it counts with `wc -c` - bytes, as the subject check does - so
   an accented character spends two of the budget. Explain *why*, not *what* -
   the diff already shows what. Separate it from the subject with one blank
   line; reference the ADR when the change follows one.
6. **Commits are signed, and signing is enforced locally only.** Sign every
   commit: `git commit -S`, or set `commit.gpgsign=true` once for the clone.
   Be honest about what enforces it - **nothing server-side does**. The
   repository is public and `main` and `develop` carry real branch protection:
   pull request required, three required status checks, force-push and
   deletion refused, `enforce_admins` on. Required signature verification is
   simply left off in that protection, and the CI gate (`ci-workflow`) runs no
   signature check either. That is now a switch nobody has flipped, not a
   limit the plan imposes. An unsigned commit merges.
   The subject rules are a different story. `.githooks/commit-msg` is still
   client-side, still bypassable with `--no-verify` or by a fresh clone that
   never pointed Git at `.githooks`, but the hook itself is gated: CI's
   `shell and compose` job feeds it seven messages and fails if it stops
   rejecting the wrong ones, and that job is one of the three required checks.
   So the hook cannot rot unnoticed, while a commit that skipped it still
   merges. Treat both signing and the convention as a discipline the team
   keeps, not a barrier the platform holds, until required signature
   verification is switched on.
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
  "blocked at the gate" -> rule 6. There is no server-side signature check;
  writing that there is creates a false sense of enforcement, worse than none.
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

Signing and the subject rules are held by hooks each developer installs. They
live in the tracked `.githooks/` directory; point Git at it, so a fresh clone
is one command away from being guarded:

```bash
git config core.hooksPath .githooks
git config commit.gpgsign true
```

`.githooks/commit-msg` as tracked. It is POSIX `sh`, not bash - CI shellchecks
it with `--shell=sh` - client-side and bypassable with `--no-verify`, and it is
the file CI's `shell and compose` job self-tests:

```sh
#!/bin/sh
# Enforces the house commit convention. See .claude/skills/commit-style.
# A local pre-filter only: CI re-verifies everything server-side.

msg_file="$1"
# Strip comment lines that git appends to the editor buffer.
subject=$(grep -v '^#' "$msg_file" | sed '/^[[:space:]]*$/d' | head -1)

fail() {
    printf 'commit-msg: %s\n' "$1" >&2
    printf '  subject: %s\n' "$subject" >&2
    exit 1
}

# Merge and fixup commits are generated by git; leave them alone.
case "$subject" in
    Merge\ *|Revert\ *|fixup!\ *|squash!\ *) exit 0 ;;
esac

[ -n "$subject" ] || fail 'empty subject'

len=$(printf '%s' "$subject" | wc -c | tr -d ' ')
[ "$len" -le 50 ] || fail "subject is $len characters, limit is 50"

case "$subject" in
    [A-Z]*) ;;
    *) fail 'subject must start with a capital letter' ;;
esac

case "$subject" in
    *.) fail 'subject must not end with a period' ;;
esac

# No Conventional Commits prefix: this project uses plain imperative subjects.
if printf '%s' "$subject" | grep -Eq '^[a-z]+(\([^)]*\))?!?:'; then
    fail 'no type(scope): prefix, use a plain imperative subject'
fi

# Imperative mood: reject the common past-tense and gerund forms. A generic
# suffix rule would reject legitimate verbs such as Read or Bind.
first=$(printf '%s' "$subject" | cut -d' ' -f1)
case "$first" in
    Added|Adds|Adding|Fixed|Fixes|Fixing|Updated|Updates|Updating\
    |Removed|Removes|Removing|Deleted|Deletes|Deleting\
    |Refactored|Refactors|Refactoring|Changed|Changes|Changing\
    |Created|Creates|Creating|Implemented|Implements|Implementing\
    |Improved|Improves|Improving|Hardened|Hardens|Hardening\
    |Renamed|Renames|Renaming|Moved|Moves|Moving)
        fail "use the imperative: '$first' is not a command form" ;;
esac

# House rule: never attribute a commit to an assistant.
if grep -qi '^[[:space:]]*co-authored-by:' "$msg_file"; then
    fail 'Co-Authored-By trailers are forbidden on this project'
fi

# Body lines wrap at 72.
line_no=0
grep -v '^#' "$msg_file" | while IFS= read -r line; do
    line_no=$((line_no + 1))
    [ "$line_no" -le 2 ] && continue
    n=$(printf '%s' "$line" | wc -c | tr -d ' ')
    if [ "$n" -gt 72 ]; then
        printf 'commit-msg: body line %s is %s characters, limit is 72\n' \
            "$line_no" "$n" >&2
        printf '  %s\n' "$line" >&2
        exit 1
    fi
done || exit 1

exit 0
```

## Note on commitlint

If commitlint is introduced, its DEFAULT preset enforces Conventional Commits - which this convention does NOT use. Configure it to THESE rules instead
(`subject-case: sentence-case`, `header-max-length: 50`, `type-enum` disabled,
`subject-full-stop` off, `body-max-line-length: 72`), or skip the dependency
entirely and enforce the subject rules with the local `commit-msg` hook above. A
hook is the lighter option here and matches the `pre-push` guard that
`branch-naming` owns.

Either way the enforcement on any given commit stays **client-side**. commitlint
installed as a hook is as bypassable as the shell script; running it in CI would
only report on commits that already exist. What CI holds is the hook's
behaviour, not your message: the `shell and compose` job replays seven cases
through `.githooks/commit-msg` and fails if the answers change, which keeps the
enforcer honest and says nothing about the commit you just wrote. Do not
describe it as a gate on what you type. The open item is signatures. The
repository is public and `main` and `develop` are protected, so required
signature verification is a setting nobody has turned on, not one the plan
withholds - turn it on, then update rule 6 and this section to say so.

## Sibling skills

- `branch-naming` - the `feature/<slug>` branch these commits live on, and the single authoritative `pre-push` hook.
- `ci-workflow` - the keyless gate, which checks build, tests and scans; it never reads a commit message or a signature, only replays cases through the `commit-msg` hook.
- `code-language` - English for subject and body.
