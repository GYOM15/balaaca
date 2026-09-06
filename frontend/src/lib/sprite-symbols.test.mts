import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { networkIcon } from "./social.ts";
import type { SocialNetwork } from "./types.ts";

/**
 * Every glyph a screen asks for is one the sprite lays down.
 *
 * <p>A `use` pointing at a symbol that does not exist is not an error anywhere.
 * The browser resolves nothing, draws nothing, and the `svg` keeps its box - so
 * the layout is right, the label beside it is right, and the picture is simply
 * absent. It reads as a rendering quirk rather than as a typo, which is how
 * `search__btn` survived and how a misspelt icon name would.
 *
 * <p>This is the same defect as `.panel__body`, one layer down: a name in one
 * file that another file has to hold up, with nothing checking that it does.
 * Six social marks arrived at once, and six is exactly the number where a
 * transposed letter goes unnoticed.
 */
test("no screen asks for a glyph the sprite does not lay down", () => {
  const root = join(import.meta.dirname, "..");
  const sprite = readFileSync(join(root, "components", "sprite.tsx"), "utf8");
  const laid = new Set(
    [...sprite.matchAll(/<symbol id="([a-z]-[a-z0-9-]+)"/g)].map((m) => m[1]),
  );

  const offenders: string[] = [];
  for (const file of sources(root)) {
    const source = readFileSync(file, "utf8");
    // `Icon` prefixes `i-`, `Scene` prefixes `s-`, and `TradeIcon` prefixes
    // `t-` but falls back to `t-default` for a slug it has no drawing for -
    // deliberately, since seventeen trades have none. So trades are out of
    // this and the two that cannot fall back are in.
    for (const match of source.matchAll(
      /<(Icon|Scene)\s[^>]*?name="([a-z0-9-]+)"/g,
    )) {
      const id = (match[1] === "Icon" ? "i-" : "s-") + match[2];
      if (laid.has(id)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      offenders.push(`${file.split("/src/")[1]}:${line} → #${id}`);
    }
  }

  assert.deepEqual(
    [...new Set(offenders)].sort(),
    [],
    "these point at a symbol the sprite does not define, so the browser draws "
      + "nothing and keeps the box:\n"
      + offenders.join("\n"),
  );
});

/**
 * The one place a name is computed rather than written, checked at its source.
 *
 * <p>The test above reads literals, and the social marks are not literals: the
 * page derives the id from the network with `networkIcon`, precisely so there
 * is no table to keep in step. That derivation is what needs proving, and it is
 * proved against the CONTRACT's own enum rather than against a list here - a
 * list here would be the third copy of the same seven words.
 */
test("every network the contract publishes has a mark", () => {
  const root = join(import.meta.dirname, "..");
  const sprite = readFileSync(join(root, "components", "sprite.tsx"), "utf8");
  const laid = new Set(
    [...sprite.matchAll(/<symbol id="([a-z]-[a-z0-9-]+)"/g)].map((m) => m[1]),
  );

  const missing = networks().filter((kind) => !laid.has(`i-${networkIcon(kind)}`));
  assert.deepEqual(missing, [], `no mark for: ${missing.join(", ")}`);
});

/** `SocialNetwork` as the one contract publishes it. */
function networks(): SocialNetwork[] {
  const spec = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "backend", "app", "src", "main",
         "resources", "META-INF", "openapi.yaml"),
    "utf8",
  );
  const at = spec.indexOf("\n    SocialNetwork:\n");
  assert.ok(at >= 0, "SocialNetwork is in the contract");
  const line = spec.slice(spec.indexOf("enum: [", at) + "enum: [".length);
  return line.slice(0, line.indexOf("]")).split(",").map((v) => v.trim()) as SocialNetwork[];
}

function sources(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && entry.name !== "generated") found.push(...sources(path));
    else if (entry.name.endsWith(".tsx")) found.push(path);
  }
  return found;
}
