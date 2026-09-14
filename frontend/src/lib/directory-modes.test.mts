import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The three ways of being served, spelt the same in all three places.
 *
 * <p>The filter panel offers them, the route validates what comes back, and
 * the contract publishes them - and each holds its own copy of the strings.
 * A fourth mode added to the contract, or one renamed, leaves the other two
 * silently stale: the box submits a value the API refuses with a 400, or the
 * route drops a legitimate mode before it is ever sent and the search quietly
 * ignores a filter the reader ticked.
 *
 * <p>The route filters against its list on purpose - forwarding an unknown
 * mode would turn a hand-edited address into an error page instead of a
 * search - which is exactly what makes the list worth checking.
 */

const SRC = join(import.meta.dirname, "..");

test("the panel, the route and the contract offer the same modes", () => {
  const published = fromContract();
  assert.deepEqual(published, ["AT_CUSTOMER", "DROP_OFF", "ON_SITE"]);

  assert.deepEqual(
    modesIn(join(SRC, "components", "home", "filters.tsx")),
    published,
    "the filter panel offers modes the contract does not publish, or misses one",
  );
  assert.deepEqual(
    modesIn(join(SRC, "app", "page.tsx")),
    published,
    "the route admits modes the contract does not publish, or drops one",
  );
});

/** The `Fulfilment` schema, read from the one document that is the contract. */
function fromContract(): string[] {
  const spec = readFileSync(
    join(SRC, "..", "..", "backend", "app", "src", "main", "resources",
         "META-INF", "openapi.yaml"),
    "utf8",
  );
  const at = spec.indexOf("\n    Fulfilment:");
  assert.notEqual(at, -1, "the contract must declare Fulfilment");

  // Written inline - `enum: [ON_SITE, DROP_OFF, AT_CUSTOMER]` - and not as a
  // block list, which is how the same file writes ErrorCode. Read as whatever
  // it is rather than as one of the two shapes: a reformatting of the contract
  // must not silently turn this guard off.
  const line = spec.slice(spec.indexOf("enum:", at));
  const found = [...line.slice(0, line.indexOf("\n")).matchAll(/([A-Z][A-Z_]+)/g)]
      .map((m) => m[1]);

  assert.ok(found.length >= 3, "the enum was not read");
  return found.sort();
}

/** The MODES list a file declares, whatever shape it takes. */
function modesIn(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const at = source.indexOf("const MODES");
  assert.notEqual(at, -1, `${path} declares no MODES`);

  const block = source.slice(at, source.indexOf(";", at));
  return [...new Set([...block.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]))].sort();
}
