import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Every code a screen branches on is one the API can actually send.
 *
 * <p>The backend closed this catalogue in both directions - nothing may throw a
 * code the contract does not publish, and nothing may be published that no path
 * can produce. Neither test looks at this side, and it showed: three screens
 * branched on NOTHING_TO_PUBLISH, NOT_INVITABLE and NOT_SUSPENDED, none of
 * which exists. The API sends INVALID_STATE_TRANSITION and VALIDATION_FAILED,
 * so every one of those refusals fell through to the generic sentence.
 *
 * <p>What that cost is worth stating: a provider ticked "publish", saved, and
 * read "l'enregistrement n'a pas abouti" - while the server knew exactly what
 * was missing and a sentence saying so sat unreachable three lines above.
 */

const PUBLISHED = publishedCodes();

/**
 * Keys a screen mints for itself, for refusals that never reach the API - an
 * empty file input, a photograph over the limit. They are documented where
 * they are raised, and they are deliberately outside the contract.
 */
const LOCAL = new Set([
  "UNKNOWN",
  "NO_FILE",
  "NOT_AN_IMAGE",
  "TOO_LARGE",
  "PHOTOS_FULL",
  "NO_MESSAGE",
]);

test("no screen branches on a code the contract does not publish", () => {
  const offenders: string[] = [];

  for (const file of sources(join(import.meta.dirname, "..", "app"))) {
    const source = readFileSync(file, "utf8");
    for (const map of source.matchAll(/(?:REFUSALS|ERRORS)[^=]*=\s*\{([\s\S]*?)\n\};/g)) {
      for (const [, key] of map[1].matchAll(/^\s{2}([A-Z][A-Z_]+):/gm)) {
        if (!PUBLISHED.has(key) && !LOCAL.has(key)) {
          offenders.push(`${file.split("/app/")[1]} → ${key}`);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "these keys can never match, so the refusal reads as the generic sentence:\n"
      + offenders.join("\n"),
  );
});

/** The enum in the one document that is the contract. */
function publishedCodes(): Set<string> {
  const spec = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "backend", "app", "src", "main",
         "resources", "META-INF", "openapi.yaml"),
    "utf8",
  );
  const start = spec.indexOf("    ErrorCode:");
  assert.notEqual(start, -1, "the contract must declare ErrorCode");

  const block = spec.slice(start, spec.indexOf("\n\n", spec.indexOf("enum:", start)));
  const codes = [...block.matchAll(/^\s+- ([A-Z][A-Z_]+)$/gm)].map((m) => m[1]);

  assert.ok(codes.length > 5, "the catalogue was not read");
  return new Set(codes);
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [path] : [];
  });
}
