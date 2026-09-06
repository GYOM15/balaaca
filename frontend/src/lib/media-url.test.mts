import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * No image is drawn from a URL the API minted, unwrapped.
 *
 * <p>The API answers with its own path - `/v1/media/<name>` - because that is
 * where IT serves the bytes. This server serves them at `/media/<name>`,
 * through a route that fetches from the API. The two differ by a segment, and
 * `mediaUrl` is the one place that bridges them: it keeps the last path
 * segment, so it accepts a bare stored name (`logo_url`, `cover_url`) and a
 * full API path (`ServicePhotoView.url`, a review's `photo_urls`) alike.
 *
 * <p>Every review photograph on the site was a broken image because three
 * `<img>` elements used the API's path directly. Nothing failed: no build
 * error, no console error, no 500 - just an empty box where a customer's
 * photograph should be, on the page whose whole job is to show it.
 *
 * <p>So: any `src` expression that reads a `url` or `photo_urls` off a payload
 * must pass through `mediaUrl`. A literal path is fine; a local asset is fine.
 */

/** The word that says the value came from the API rather than from this file. */
const FROM_API = /\b(url|_urls)\b/;

test("an image built from an API url goes through mediaUrl", () => {
  const offenders: string[] = [];

  for (const file of sources(join(import.meta.dirname, "..", "app"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\bsrc=\{([^}]*)\}/g)) {
      const expression = match[1] ?? "";
      if (FROM_API.test(expression) && !expression.includes("mediaUrl")) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${file.split("/app/")[1]}:${line} → src={${expression.trim()}}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "these draw an image from a path the API minted, which this server does "
      + "not serve - the result is an empty box and no error anywhere:\n"
      + offenders.join("\n"),
  );
});

function sources(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...sources(path));
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
}
