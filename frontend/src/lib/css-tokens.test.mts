import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Every custom property the stylesheet reads is one it, or the application,
 * actually sets.
 *
 * <p>A `var(--x)` naming nothing is not an error anywhere. The declaration
 * using it becomes invalid at computed-value time and the property falls back
 * to its INITIAL value, silently. `--p-danger-700` was referenced by
 * `.btn--danger:hover` and declared nowhere, so hovering any destructive button
 * in the product dropped its background to transparent - a red button turning
 * white, taking its white label with it. No build error, no console warning,
 * and eleven buttons across seven screens.
 *
 * <p>A `var(--x, fallback)` is deliberate and is left alone: the fallback IS
 * the value when nothing sets it.
 */

/**
 * Set from outside the stylesheet, so their absence here is correct.
 *
 * <p>The two fonts come from `next/font` in the root layout. The rest are
 * per-instance values a component passes as an inline style - a stack's gap, a
 * grid's row gap, an item's index and delay in a staggered animation, an
 * appointment's accent colour.
 */
const FROM_OUTSIDE = new Set([
  "--font-face",
  "--font-display-face",
  "--stack-gap",
  "--row-gap",
  "--appt-accent",
  "--i",
  "--delay",
]);

/**
 * Both stylesheets the product ships, and the second is why this list exists.
 *
 * <p>The Keycloak theme was outside this check for as long as it had existed,
 * and it carried exactly the defect the check is for: `body` read
 * `--font-sans`, which is declared nowhere - the token is `--font`. The
 * declaration was therefore invalid and every sign-in, registration, password
 * reset and e-mail confirmation screen rendered its body copy in the browser's
 * default serif. The titles were right, because they read `--font-display`,
 * which exists, so the pages looked deliberate.
 *
 * <p>It is a separate deployable in every sense - its own stylesheet, served
 * by Keycloak from its own origin - which is precisely how it stayed out of a
 * guard written for the front end.
 */
const STYLESHEETS = [
  ["the product", join(import.meta.dirname, "..", "app", "globals.css")],
  ["the sign-in theme", join(
    import.meta.dirname, "..", "..", "..", "infrastructure", "keycloak",
    "themes", "balaaca", "login", "resources", "css", "balaaca.css",
  )],
] as const;

test("no rule reads a custom property nothing sets", () => {
  for (const [what, path] of STYLESHEETS) {
    // Comments out first. They are prose ABOUT custom properties, including
    // ones deliberately named as having been missing once - and a guard that
    // reads its own postmortems reports them as live defects.
    const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

    // Only the bare form. `var(--x, 2.75rem)` carries its own answer.
    const read = new Set(
      [...css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)].map((m) => m[1] as string),
    );
    const set = new Set(
      [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] as string),
    );

    const dangling = [...read].filter((name) => !set.has(name) && !FROM_OUTSIDE.has(name));

    assert.deepEqual(
      dangling.sort(),
      [],
      `in ${what}, these resolve to nothing, so the declaration using them is `
        + "dropped and the property falls back to its initial value with no "
        + "error anywhere:\n"
        + dangling.join("\n"),
    );
  }
});
