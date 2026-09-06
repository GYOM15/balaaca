import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { HANDLE_PATTERN } from "./social.ts";

/**
 * The pattern on the form is the pattern in the contract.
 *
 * <p>It has to be a copy: the form needs it as an HTML attribute in a browser,
 * and openapi.yaml is not in the deployed image. What a copy must not be is
 * unwatched - a field that refuses MORE than the API does turns a valid handle
 * into a form that will not submit and says nothing useful, and one that
 * refuses LESS sends a request that comes back 400 with no field named.
 */
test("the form refuses exactly what the contract refuses", () => {
  const spec = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "backend", "app", "src", "main",
         "resources", "META-INF", "openapi.yaml"),
    "utf8",
  );
  const at = spec.indexOf("\n    SocialHandle:\n");
  assert.ok(at >= 0, "SocialHandle is in the contract");
  const open = spec.indexOf("pattern: '", at) + "pattern: '".length;
  const published = spec.slice(open, spec.indexOf("'", open));

  assert.equal(HANDLE_PATTERN, published);
});

/**
 * And it does what it is for. A pattern that matched everything would pass the
 * test above and protect nothing, so the class it exists to stop is named.
 */
test("the pattern admits a handle and refuses a scheme", () => {
  const pattern = new RegExp(HANDLE_PATTERN);
  for (const good of ["salon.fatou", "@salonfatou", "company/salon", "channel/UC1",
                      "https://salon-fatou.gn", "https://salon-fatou.gn/rdv"]) {
    assert.ok(pattern.test(good), `${good} should be admitted`);
  }
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example",
                     "http://evil.example", "https://x@evil.example", "salon awa",
                     "salon?x=1", "salon#x", "..", ""]) {
    assert.ok(!pattern.test(bad), `${bad} should be refused`);
  }
});
