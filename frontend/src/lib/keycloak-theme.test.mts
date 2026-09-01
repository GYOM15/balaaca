import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The sign-in screens are served by Keycloak, from its own origin, so they
 * cannot import the application's stylesheet. Their palette is a copy - and a
 * copy nobody checks is a copy that drifts, quietly, until the two halves of
 * one product are two different greens.
 *
 * <p>These are the checks that make the copy safe to keep.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");
const THEME = join(ROOT, "infrastructure", "keycloak", "themes", "balaaca");

const globals = readFileSync(join(ROOT, "frontend", "src", "app", "globals.css"), "utf8");

/** The token block, as the design system declares it. */
function tokenBlock(css: string): string {
  const start = css.indexOf(":root {");
  assert.notEqual(start, -1, "globals.css declares no :root block");
  const end = css.indexOf("\n}", start);
  return css.slice(start, end + 2);
}

/** A token's value with its aliases followed to the raw one underneath. */
function resolve(css: string, name: string): string {
  const seen = new Set<string>();
  let current = name;
  for (;;) {
    if (seen.has(current)) throw new Error(`${name} is a cycle`);
    seen.add(current);
    const found = new RegExp(`${current}\\s*:\\s*([^;]+);`).exec(css);
    assert.ok(found, `${current} is not declared`);
    const value = found[1]!.trim();
    const alias = /^var\((--[a-z0-9-]+)\)$/.exec(value);
    if (!alias) return value;
    current = alias[1]!;
  }
}

test("the sign-in screens carry the design system's own tokens, not a retype", () => {
  const themeCss = readFileSync(join(THEME, "login", "resources", "css", "balaaca.css"), "utf8");
  assert.equal(
    tokenBlock(themeCss),
    tokenBlock(globals),
    "infrastructure/keycloak/themes/balaaca/login/resources/css/balaaca.css holds a " +
      "copy of the :root block from frontend/src/app/globals.css. They no longer " +
      "match. Copy the block across again - the sign-in page is the first screen " +
      "of the product and it cannot be a different colour from the second.",
  );
});

/**
 * No mail client has ever supported a custom property, so the messages write
 * hex. Each one is named here with the token it came from; if the design system
 * moves a colour, this fails rather than letting an e-mail keep the old one.
 */
const EMAIL_COLOURS: Array<[string, string]> = [
  ["--bg", "#FAF8F2"],
  ["--surface", "#FFFFFF"],
  ["--border", "#E4E0D4"],
  ["--text", "#17201E"],
  ["--text-secondary", "#505653"],
  ["--text-tertiary", "#666C69"],
  ["--brand", "#123C35"],
  ["--accent-strong", "#7E6023"],
  ["--text-on-dark", "#FFFFFF"],
];

test("every colour the messages hard-code still resolves to its token", () => {
  const html = ["template", "email-verification", "password-reset", "executeActions"]
    .map((name) => readFileSync(join(THEME, "email", "html", `${name}.ftl`), "utf8"))
    .join("\n");

  for (const [token, hex] of EMAIL_COLOURS) {
    assert.equal(
      resolve(globals, token).toUpperCase(),
      hex,
      `${token} has moved. The messages write ${hex} for it; change them together.`,
    );
  }

  // And the other way round: a hex in a message that is on no token is a colour
  // somebody invented, which is how a brand stops being one.
  const known = new Set(EMAIL_COLOURS.map(([, hex]) => hex.toUpperCase()));
  const used = new Set(
    [...html.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase()),
  );
  const stray = [...used].filter((hex) => !known.has(hex));
  assert.deepEqual(stray, [], `colours in the messages that no design token declares: ${stray}`);
});
