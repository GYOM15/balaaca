import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

/**
 * Every operation this client calls answers in a type it asked for.
 *
 * <p>JAX-RS negotiates the response type against the method's `@Produces`,
 * which the generator writes from the contract. An operation whose only
 * declared body is an RFC 7807 refusal - `reportProvider` answers 202 with
 * nothing at all, `deleteClosure` 204 - produces `application/problem+json` and
 * nothing else. A client asking for `application/json` alone therefore gets
 * `406`, decided before the handler runs.
 *
 * <p>What that looked like: a customer filled in a report, pressed send, and
 * read "le signalement n'est pas parti" - every time, with nothing logged, the
 * row never written, and the API perfectly healthy. `deleteClosure` had the
 * same fault and nobody had noticed.
 *
 * <p>So the header and the contract have to agree, and this is what checks it.
 */

/** What lib/api.ts sends on every call it makes. */
const ACCEPTED = new Set(["application/json", "application/problem+json"]);

/**
 * Fetched outside `call()`, by a route handler that sets its own header: the QR
 * code is an SVG and the media route streams the bytes.
 */
const NOT_THROUGH_THE_CLIENT = new Set([
  "/v1/provider-profile/qr-code",
  "/v1/media/{name}",
]);

test("no operation answers in a type the client did not ask for", () => {
  const spec = parse(
    readFileSync(
      join(import.meta.dirname, "..", "..", "..", "backend", "app", "src", "main",
           "resources", "META-INF", "openapi.yaml"),
      "utf8",
    ),
  ) as Contract;

  const shared = spec.components?.responses ?? {};
  const offenders: string[] = [];

  for (const [path, item] of Object.entries(spec.paths)) {
    if (NOT_THROUGH_THE_CLIENT.has(path)) continue;

    for (const [verb, operation] of Object.entries(item)) {
      const responses = operation?.responses;
      if (!responses) continue;

      const produced = new Set<string>();
      for (const response of Object.values(responses)) {
        for (const type of Object.keys(contentOf(response, shared))) produced.add(type);
      }

      // An operation that produces nothing at all is fine: there is nothing to
      // negotiate. One that produces only types we do not accept is a 406.
      if (produced.size > 0 && ![...produced].some((type) => ACCEPTED.has(type))) {
        offenders.push(`${verb.toUpperCase()} ${path} produces ${[...produced].join(", ")}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "these answer 406 to lib/api.ts, decided before the handler runs:\n"
      + offenders.join("\n"),
  );
});

type Body = { content?: Record<string, unknown> };
type Contract = {
  paths: Record<string, Record<string, { responses?: Record<string, Body & { $ref?: string }> }>>;
  components?: { responses?: Record<string, Body> };
};

function contentOf(response: Body & { $ref?: string }, shared: Record<string, Body>) {
  if (response?.$ref) {
    return shared[response.$ref.split("/").pop() ?? ""]?.content ?? {};
  }
  return response?.content ?? {};
}
