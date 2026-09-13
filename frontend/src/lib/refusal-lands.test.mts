import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { refusalKeepsTheHour } from "./refusal.ts";

/**
 * A refused booking comes back to the step that can fix it.
 *
 * <p>Two files decide this together: the server action puts the chosen hour
 * back in the URL, and the page reads it to land on the form rather than on
 * the hour list. Written apart they were two places that must agree - and the
 * failure mode is silent, because a page that lands on step four with no hour
 * looks exactly like a page that meant to.
 *
 * <p>What it cost while there was no rule at all: a customer typed a name, a
 * telephone number, an e-mail, a note and an address, mistyped one digit, and
 * was returned to "quel horaire ?" with the slot unchosen and every box empty.
 * The report was that booking did not work.
 */

const RESERVER = join(import.meta.dirname, "..", "app", "p", "[slug]", "reserver");

test("only a refusal of the boxes keeps the hour", () => {
  assert.equal(refusalKeepsTheHour("VALIDATION_FAILED"), true);

  // Every other published code is a refusal of the SLOT. Read from the
  // contract rather than listed here, so a code added there is a code this
  // test asks about.
  for (const code of publishedCodes()) {
    if (code === "VALIDATION_FAILED") continue;
    assert.equal(
      refusalKeepsTheHour(code),
      false,
      `${code} refuses the hour, so the hour must not be carried back into its recap`,
    );
  }

  assert.equal(refusalKeepsTheHour("UNKNOWN"), false);
  assert.equal(refusalKeepsTheHour(null), false);
  assert.equal(refusalKeepsTheHour(undefined), false);
});

test("both halves ask the same function, at the two lines that matter", () => {
  // The action's half: the line that puts the hour back in the URL. Written
  // against the code itself it would drift from the page's half, and the two
  // disagreeing is a customer landing on a step the URL no longer answers.
  assert.match(
    statementContaining(readFileSync(join(RESERVER, "actions.ts"), "utf8"),
                        'query.set("time"'),
    /refusalKeepsTheHour/,
    "actions.ts decides for itself whether to carry the hour back",
  );

  // The page's half: the line that lands on the form rather than on the hour
  // list. `page.tsx` names VALIDATION_FAILED elsewhere on purpose - the
  // catalogue of SENTENCES is a different decision and is allowed to.
  assert.match(
    statementContaining(readFileSync(join(RESERVER, "page.tsx"), "utf8"), "return 5;"),
    /refusalKeepsTheHour/,
    "page.tsx decides for itself which step a refusal lands on",
  );
});

/** The enum in the one document that is the contract. */
function publishedCodes(): string[] {
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
  return codes;
}

/** The whole statement a fragment sits in, back to the previous semicolon. */
function statementContaining(source: string, fragment: string): string {
  const at = source.indexOf(fragment);
  assert.notEqual(at, -1, `nothing in this file contains ${fragment}`);
  const from = source.lastIndexOf(";", at);
  return source.slice(from + 1, source.indexOf(";", at) + 1);
}
