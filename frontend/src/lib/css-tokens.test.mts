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

test("no rule reads a custom property nothing sets", () => {
  const css = readFileSync(
    join(import.meta.dirname, "..", "app", "globals.css"),
    "utf8",
  );

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
    "these resolve to nothing, so the declaration using them is dropped and the "
      + "property falls back to its initial value with no error anywhere:\n"
      + dangling.join("\n"),
  );
});
