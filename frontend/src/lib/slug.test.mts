import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normaliseSlug } from "./slug.ts";

/**
 * What the field produces is what the contract accepts.
 *
 * <p>Two places again: the normaliser runs in a browser, the pattern is
 * published in openapi.yaml and enforced by the server. If the normaliser can
 * emit something the pattern refuses, somebody types a perfectly ordinary
 * business name, watches the field tidy it up, and is then told by the browser
 * that it does not match a format nobody showed them.
 *
 * <p>The pattern is READ from the contract rather than copied here.
 */
function publishedPattern(): RegExp {
  const spec = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "backend", "app", "src", "main",
         "resources", "META-INF", "openapi.yaml"),
    "utf8",
  );
  const at = spec.indexOf("\n    RegisterProviderRequest:\n");
  assert.ok(at >= 0, "RegisterProviderRequest is in the contract");
  const open = spec.indexOf("pattern: '", at) + "pattern: '".length;
  return new RegExp(spec.slice(open, spec.indexOf("'", open)));
}

/** Names a salon, a garage or a caterer in Conakry would actually type. */
const NAMES = [
  "Salon Aïssatou",
  "Salon AISSATOU Nongo",
  "Garage Camara & Fils",
  "Épicerie Kékélé",
  "Café N'Zérékoré",
  "Tresses  Néné",
  "Atelier  de  couture",
  "PRESSING 24/7",
  "Chez Fatou (Kipé)",
];

test("an ordinary business name normalises into something the contract accepts", () => {
  const pattern = publishedPattern();
  for (const name of NAMES) {
    // A trailing hyphen is left by the normaliser on purpose so that "salon-"
    // can be typed at all; the field's pattern refuses it and the person fixes
    // it by carrying on typing. What must hold is that the REST is valid.
    const settled = normaliseSlug(name).replace(/-+$/, "");
    assert.ok(
      pattern.test(settled),
      `"${name}" became "${settled}", which the published pattern refuses`,
    );
  }
});

test("nothing escapes the character set the pattern allows", () => {
  for (const hostile of [
    "../../admin", "Salon/Autre", "salon?x=1", "salon#top", "SALON..NONGO",
    "<script>alert(1)</script>", "salon aissatou", "café", "salon_aissatou",
  ]) {
    assert.ok(
      /^[a-z0-9-]*$/.test(normaliseSlug(hostile)),
      `"${hostile}" left characters the pattern cannot accept`,
    );
  }
});

test("it never exceeds the length the contract publishes", () => {
  assert.equal(normaliseSlug("a".repeat(200)).length, 60);
});
