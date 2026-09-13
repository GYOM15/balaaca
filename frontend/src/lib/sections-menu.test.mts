import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The dashboard's menu stays shut until somebody opens it.
 *
 * <p>Three places have to agree and nothing compared them: the `id` on the
 * `<nav>`, the two triggers that point a fragment at it, and the pair of rules
 * that hide it and reveal it. Rename any one of them and the others keep
 * working perfectly - the fragment matches nothing, `:target` never fires, and
 * the nav simply renders where it sits in the document.
 *
 * <p>Which is exactly what it did. The whole navigation was laid out under the
 * content of EVERY screen on a telephone: your services, then the entire menu
 * stacked below them, then the tab bar. Nothing was broken in a way anything
 * could report; it just read as a page that ended in a menu, on every page.
 *
 * <p>The failure mode of a regression here is the same silence, so this reads
 * both files and compares.
 */

const ROOT = join(import.meta.dirname, "..");
const MENU_ID = "sections";

test("the menu is hidden by default and revealed only by :target", () => {
  const css = tidy(readFileSync(join(ROOT, "app", "globals.css"), "utf8"));

  assert.match(
    css,
    new RegExp(`#${MENU_ID}\\s*\\{[^}]*display:\\s*none`),
    "globals.css must hide the menu by default, or it renders under every screen",
  );
  assert.match(
    css,
    new RegExp(`#${MENU_ID}:target\\s*\\{[^}]*display:\\s*(?!none)`),
    "globals.css must reveal it on :target, or nothing can open it",
  );
  // Fixed, not merely visible. Shown in the flow it would still be a section
  // appended to the page, which is the thing being fixed.
  assert.match(
    css,
    new RegExp(`#${MENU_ID}:target\\s*\\{[^}]*position:\\s*fixed`),
    "the open menu must cover the page rather than extend it",
  );
});

test("the markup and every trigger name the same fragment", () => {
  const layout = readFileSync(
    join(ROOT, "app", "dashboard", "layout.tsx"), "utf8",
  );

  assert.ok(
    layout.includes(`id="${MENU_ID}"`),
    `the nav must carry id="${MENU_ID}", which is what :target matches`,
  );
  // A way out that is not the back button: tapping the trigger again does
  // nothing, because the fragment is already the target.
  assert.ok(
    layout.includes('href="#"'),
    "the open menu must carry a control that clears the fragment",
  );

  // The tab bar's last slot lives in the layout; the hamburger is repeated in
  // every screen's own appbar, eleven files of it. A single one pointing
  // somewhere else is a control that opens nothing on that screen alone -
  // which nobody would find, because every other screen works.
  const offenders: string[] = [];
  for (const file of screens(join(ROOT, "app", "dashboard"))) {
    const source = readFileSync(file, "utf8");
    for (const [, target] of source.matchAll(
      /aria-label="Menu"[\s\S]{0,200}?href="(#[a-z-]*)"|href="(#[a-z-]*)"[^>]{0,200}?aria-label="Menu"/g,
    )) {
      if (target && target !== `#${MENU_ID}`) {
        offenders.push(`${file.split("/dashboard/")[1]} -> ${target}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `these open nothing:\n${offenders.join("\n")}`);

  const triggers = readdirCount(join(ROOT, "app", "dashboard"), `href="#${MENU_ID}"`);
  assert.ok(triggers > 1, `only ${triggers} control points at the menu`);
});

function screens(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return screens(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function readdirCount(dir: string, needle: string): number {
  return screens(dir).reduce(
    (total, file) => total + readFileSync(file, "utf8").split(needle).length - 1,
    0,
  );
}

/** Comments and newlines out, so a rule split across lines still matches. */
function tidy(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
}
