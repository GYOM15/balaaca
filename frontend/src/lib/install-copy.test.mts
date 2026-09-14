import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The iOS instructions may not name one browser.
 *
 * <p>`install-offer.ts` states the rule in its own comment and nothing checked
 * it: every browser on iOS is WebKit, every one of them reaches Add to Home
 * Screen, "just not all from the same button. The copy must therefore not name
 * one." Both copies of the copy named Safari, so somebody on Chrome was told
 * to look in a bar belonging to a browser they were not using.
 *
 * <p>Both copies, because the words were written twice - in the floating sheet
 * and on "Mon compte" - which is how one wrong sentence became two. They are
 * one module now, and this checks that too: a third copy appearing somewhere
 * is a third chance to be wrong in one place only.
 */

const SRC = join(import.meta.dirname, "..");
const BROWSERS = ["Safari", "Chrome", "Firefox", "Edge", "Opera"];

test("the step that says where to press names no browser", () => {
  const steps = readFileSync(join(SRC, "components", "install-steps.tsx"), "utf8");
  const ios = steps.slice(steps.indexOf("export const IOS_STEPS"),
                          steps.indexOf("MENU_STEPS"));
  // The FIRST step only. That is the one that points at a control, and the one
  // that was wrong: it named Safari's bar to somebody holding Chrome. A later
  // step may name a browser - the list ends by sending anybody who cannot find
  // the entry to Safari, which is true and is the only way out of a share
  // sheet that does not have it.
  const first = ios.slice(ios.indexOf("["), ios.indexOf("</>,") + 4);

  const named = BROWSERS.filter((browser) => first.includes(browser));
  assert.deepEqual(
    named,
    [],
    `the first iOS step names ${named.join(", ")}. On iOS every browser is `
      + "WebKit and reaches Add to Home Screen from a different button, so the "
      + "step that says where to press must describe the icon, not a browser.",
  );
});

test("the steps are written once", () => {
  // A sentence from each list, as the shared module writes it. Found anywhere
  // else, somebody has copied the words back out - and a copy is a sentence
  // that will be corrected in one place only.
  const offenders: string[] = [];
  for (const file of sources(join(SRC, "app"))) {
    const source = readFileSync(file, "utf8");
    if (source.includes("Sur l’écran d’accueil") && !source.includes("InstallSteps")) {
      offenders.push(file.split("/src/")[1]);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these write the install steps out again instead of reading `
      + `components/install-steps.tsx:\n${offenders.join("\n")}`,
  );
});

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [path] : [];
  });
}
