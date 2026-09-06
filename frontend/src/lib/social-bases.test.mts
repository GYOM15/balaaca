import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { NETWORK_BASES } from "./social.ts";

/**
 * The form's prefix and the server's composition are the same string.
 *
 * <p>The provider types a handle and the server builds the address from a base
 * that lives in `SocialNetwork.java`. The form prints that base in front of the
 * field, so a provider can see what they are typing into - and that is a second
 * copy of seven strings, in a different language, in a different repository
 * layer, where being wrong breaks nothing that anyone would notice: the field
 * would simply say `facebook.com/` while the link went to `www.facebook.com/`.
 *
 * <p>A label that quietly lies about where a link goes is not a cosmetic bug on
 * a page whose whole safety argument is that the platform, not the provider,
 * decides the host. So the two are read and compared.
 */
test("the form's prefixes are the bases the server composes with", () => {
  const java = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "backend", "providers", "src", "main",
         "java", "com", "balaaca", "providers", "domain", "SocialNetwork.java"),
    "utf8",
  );

  // FACEBOOK("https://www.facebook.com/"),  and  WEBSITE("");
  const composed = new Map(
    [...java.matchAll(/^\s{4}([A-Z]+)\("([^"]*)"\)[,;]/gm)].map((m) => [m[1], m[2]]),
  );

  assert.equal(composed.size, Object.keys(NETWORK_BASES).length,
               "one network here, one network there");
  for (const [kind, base] of Object.entries(NETWORK_BASES)) {
    assert.equal(composed.get(kind), base,
                 `${kind}: the form says "${base}", the server composes with `
                 + `"${composed.get(kind)}"`);
  }
});
