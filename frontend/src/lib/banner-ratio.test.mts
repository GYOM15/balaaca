import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The cover band's proportion is decided twice, and the two have to agree.
 *
 * <p>The API crops every uploaded cover to a fixed ratio before it stores it;
 * the stylesheet draws each band at a ratio of its own, and there is more than
 * one band. When they match, the
 * stored file fills the band exactly and nothing is cropped a second time. When
 * they drift, `object-fit: cover` silently takes the difference out of the
 * picture - and nobody finds out, because both halves still look plausible on
 * their own. That is precisely how the band ended up showing 37% of what a
 * provider had approved.
 *
 * <p>The two values cannot be shared: one is a Java constant compiled into the
 * API, the other a CSS declaration shipped to a browser. So they are compared
 * instead, here, the way the Keycloak theme's palette is compared to the design
 * system's - a copy nobody checks is a copy that drifts.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");

const shaping = readFileSync(
  join(ROOT, "backend", "platform-kernel", "src", "main", "java", "com", "balaaca",
       "platformkernel", "media", "SanitisedImage.java"),
  "utf8",
);

const globals = readFileSync(join(ROOT, "frontend", "src", "app", "globals.css"), "utf8");

/** A public int constant, read from the source the API is built from. */
function constant(name: string): number {
  const found = new RegExp(
    `public\\s+static\\s+final\\s+int\\s+${name}\\s*=\\s*(\\d+)\\s*;`,
  ).exec(shaping);
  assert.ok(found, `${name} is not declared in SanitisedImage.java`);
  return Number(found[1]);
}

/** The first declaration of a property inside a rule, as authored. */
function declaration(selector: string, property: string): string {
  const start = globals.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `globals.css has no ${selector} rule`);
  const end = globals.indexOf("}", start);
  const found = new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(
    globals.slice(start, end),
  );
  assert.ok(found, `${selector} declares no ${property}`);
  return found[1]!.trim();
}

test("every band is drawn in the proportion the API stores it in", () => {
  const stored = constant("BANNER_WIDTH") / constant("BANNER_HEIGHT");
  const bands = coverRules();

  // Two today: the public page's hero and the directory card. The list is
  // FOUND rather than written, which is the whole point of this pass: the
  // first version of this test named `.pcover` and only `.pcover`, and the
  // card was then drawn at 5/2 with nothing to notice. A guard that checks
  // one of the two places is a guard that reports green about the other.
  assert.ok(bands.length >= 2,
            `found ${bands.length} cover bands, expected at least the hero `
            + "and the directory card - has a selector been renamed?");

  for (const [selector, drawn] of bands) {
    const parts = drawn.split("/").map((n) => Number(n.trim()));
    assert.equal(parts.length, 2, `${selector} aspect-ratio is not a ratio: ${drawn}`);
    assert.equal(
      Math.round((parts[0]! / parts[1]!) * 100) / 100,
      Math.round(stored * 100) / 100,
      `the API stores covers at ${stored}:1 and ${selector} draws them at `
        + `${drawn}, so \`object-fit: cover\` takes the difference out of a `
        + "picture the provider already approved. Change "
        + "SanitisedImage.BANNER_WIDTH/BANNER_HEIGHT and every band together, "
        + "and re-upload existing covers - a file already stored keeps the "
        + "shape it was cropped to.",
    );
  }
});

/**
 * Every rule that draws a stored cover, found by its name.
 *
 * <p>Media queries are excluded on purpose, and that is not laziness: the hero
 * widens to 5/2 under 700 px because 4:1 there would be ninety-eight pixels of
 * letterbox slot, and that deviation is deliberate, commented, and crops the
 * SIDES where the subject is not. What must not drift is the shape a band has
 * by default.
 */
function coverRules(): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  let depth = 0;
  let head = 0;

  for (let i = 0; i < globals.length; i++) {
    if (globals[i] === "{") {
      depth++;
      if (depth === 1) head = i;
      continue;
    }
    if (globals[i] !== "}") continue;
    depth--;
    // Only rules at the top level: a media query opens a block of its own, so
    // everything inside it closes back to depth 1 and is skipped here.
    if (depth !== 0) continue;

    const selector = globals.slice(globals.lastIndexOf("}", head - 1) + 1, head)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    // A single class whose name ends in "cover": `.pcover`, `.pcard__cover`.
    // Not `.pcard__cover img`, which paints the picture rather than the box.
    if (!selector.split(",").some((part) => /^\.[a-z][\w-]*cover$/.test(part.trim()))) {
      continue;
    }
    const ratio = /aspect-ratio\s*:\s*([^;]+);/.exec(globals.slice(head, i));
    if (ratio) found.push([selector, ratio[1]!.trim()]);
  }
  return found;
}

test("the dashboard preview announces the size the API actually stores", () => {
  const page = readFileSync(
    join(ROOT, "frontend", "src", "app", "dashboard", "profile", "page.tsx"),
    "utf8",
  );

  // The intrinsic size on the preview img. It reserves the box before the
  // bytes arrive, so a wrong one makes the panel jump on load - and it is the
  // number a provider reads as "what is expected of me".
  // Anchored on the alt text, which is customer-facing French and therefore
  // moves: "Bandeau actuel" became "Photo de couverture actuelle" the day
  // somebody decided that jargon was not clear to every reader. The guard
  // followed, which is the guard working - but it is worth knowing that this
  // regex is the second place that wording lives.
  const found = /alt="Photo de couverture actuelle"\s+width=\{(\d+)\}\s+height=\{(\d+)\}/.exec(page);
  assert.ok(found, "the cover preview declares no intrinsic size");

  assert.equal(Number(found[1]), constant("BANNER_WIDTH"));
  assert.equal(Number(found[2]), constant("BANNER_HEIGHT"));
});
