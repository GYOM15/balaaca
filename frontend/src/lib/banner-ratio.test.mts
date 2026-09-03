import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The cover band's proportion is decided twice, and the two have to agree.
 *
 * <p>The API crops every uploaded cover to a fixed ratio before it stores it;
 * the stylesheet draws the band at a ratio of its own. When they match, the
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

test("the band is drawn in the proportion the API stores it in", () => {
  const stored = constant("BANNER_WIDTH") / constant("BANNER_HEIGHT");

  // "4 / 1", as aspect-ratio is written.
  const drawn = declaration(".pcover", "aspect-ratio");
  const parts = drawn.split("/").map((n) => Number(n.trim()));
  assert.equal(parts.length, 2, `.pcover aspect-ratio is not a ratio: ${drawn}`);

  assert.equal(
    Math.round(stored * 100) / 100,
    Math.round((parts[0]! / parts[1]!) * 100) / 100,
    `the API stores covers at ${stored}:1 and the band draws them at ${drawn}. ` +
      "One of the two moved. Change SanitisedImage.BANNER_WIDTH/BANNER_HEIGHT " +
      "and .pcover's aspect-ratio together, and re-upload existing covers - a " +
      "file already stored keeps the shape it was cropped to.",
  );
});

test("the dashboard preview announces the size the API actually stores", () => {
  const page = readFileSync(
    join(ROOT, "frontend", "src", "app", "dashboard", "profile", "page.tsx"),
    "utf8",
  );

  // The intrinsic size on the preview img. It reserves the box before the
  // bytes arrive, so a wrong one makes the panel jump on load - and it is the
  // number a provider reads as "what is expected of me".
  const found = /alt="Bandeau actuel"\s+width=\{(\d+)\}\s+height=\{(\d+)\}/.exec(page);
  assert.ok(found, "the cover preview declares no intrinsic size");

  assert.equal(Number(found[1]), constant("BANNER_WIDTH"));
  assert.equal(Number(found[2]), constant("BANNER_HEIGHT"));
});
