import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { asRequest } from "./profile-request.js";
import type { ProviderProfile } from "./types.js";

/**
 * Publishing a page must not clear half of it.
 *
 * <p>`PUT /v1/provider-profile` replaces the resource, and the publish switch
 * has no form of its own to carry the rest - it reads the profile back and
 * returns it with one field decided. So `asRequest` has to name EVERY property
 * the request takes, and nothing was checking that it did. `links` was added to
 * the contract and this function did not gain it: turning the page live would
 * have deleted every social link on it, with a 200 and no message anywhere.
 *
 * <p>The list comes from the contract rather than from a copy here, so a field
 * added tomorrow fails this the same way.
 */
test("the publish switch sends back every field the request takes", () => {
  const spec = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "backend", "app", "src", "main",
         "resources", "META-INF", "openapi.yaml"),
    "utf8",
  );

  const start = spec.indexOf("\n    ProviderProfileRequest:\n");
  assert.ok(start >= 0, "ProviderProfileRequest is in the contract");
  const propsAt = spec.indexOf("\n      properties:\n", start);
  // The next schema at the same indentation ends this one.
  const end = spec.indexOf("\n    PublicServiceOffering:", propsAt);
  assert.ok(propsAt >= 0 && end > propsAt, "the schema is bounded");

  const published = new Set(
    [...spec.slice(propsAt, end).matchAll(/^ {8}([a-z_0-9]+):$/gm)].map((m) => m[1]),
  );
  assert.ok(published.size > 5, `read ${published.size} properties, expected the whole body`);

  // Decided by the caller, not carried over: that is the entire point of the
  // switch, and sending the stored value back would make it do nothing.
  published.delete("published");

  const sent = new Set(Object.keys(asRequest(EMPTY)));
  const missing = [...published].filter((field) => !sent.has(field));
  assert.deepEqual(
    missing,
    [],
    "these are in ProviderProfileRequest and asRequest does not send them, so "
      + `publishing the page clears them: ${missing.join(", ")}`,
  );

  const invented = [...sent].filter((field) => !published.has(field));
  assert.deepEqual(invented, [], `asRequest sends fields the contract has no place for: ${invented}`);
});

/** Every key present, every value undefined: this test is about names. */
const EMPTY = {
  slug: "salon-fatou",
  business_name: "Salon Fatou",
  timezone: "Africa/Conakry",
  published: false,
  status: "ACTIVE",
} as ProviderProfile;
