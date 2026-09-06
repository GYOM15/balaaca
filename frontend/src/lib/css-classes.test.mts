import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Every design-system part a screen names is one the stylesheet draws.
 *
 * <p>A class with no rule behind it is not an error anywhere. React writes it
 * into the markup, the browser finds nothing, and the element renders with
 * whatever it inherits. `.panel__body` was used on four cards and declared
 * nowhere: `.panel__head` exists, `.panel__title` exists, `.panel__sub` exists,
 * so the name reads as real - and the content inside it sat flush against the
 * card's border on every review, in the dashboard and in the moderation
 * console. Nothing failed and nothing said so.
 *
 * <p>Only BEM ELEMENTS are checked - `block__element`, the shape the design
 * system uses for a part of a component. Blocks and modifiers are deliberately
 * out: a modifier is often composed at run time, and a bare block name collides
 * with too many utilities to be worth the noise. 210 element classes are in use
 * and this reads all of them.
 */
test("no screen names a part the stylesheet does not draw", () => {
  const root = join(import.meta.dirname, "..");
  const css = readFileSync(join(root, "app", "globals.css"), "utf8");
  const drawn = new Set([...css.matchAll(/\.([a-z][a-z0-9-]*__[a-z0-9-]+)/g)].map((m) => m[1]));

  const offenders: string[] = [];
  for (const file of sources(root)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const name of (match[1] ?? match[2] ?? "").split(/\s+/)) {
        if (!/^[a-z][a-z0-9-]*__[a-z0-9-]+$/.test(name) || drawn.has(name)) continue;
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${file.split("/src/")[1]}:${line} → .${name}`);
      }
    }
  }

  assert.deepEqual(
    [...new Set(offenders)].sort(),
    [],
    "these name a part globals.css does not draw, so the element renders with "
      + "whatever it inherits and nothing says so:\n"
      + offenders.join("\n"),
  );
});

function sources(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && entry.name !== "generated") found.push(...sources(path));
    else if (entry.name.endsWith(".tsx")) found.push(path);
  }
  return found;
}
