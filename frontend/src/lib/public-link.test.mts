import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * No screen offers a link to a page that does not exist yet.
 *
 * <p>`/p/{slug}` resolves through a published-only lookup, so a business that
 * has not published has no page there - by design, and the same 404 an unknown
 * handle gets. Four places in the dashboard linked to it unconditionally: the
 * sidebar, the account panel, the hours aside, and a "Prévisualiser" button
 * sitting on a card that ONLY renders while the page is unpublished. Every one
 * of them was a 404 offered to a provider on their own dashboard, which reads
 * as a broken product rather than as an unpublished page.
 *
 * <p>Two places that had to agree with nothing checking that they did, which is
 * the shape of almost every defect this project has had. So this checks it.
 *
 * <p>Deliberately narrow: it looks for the literal link and asks that the word
 * `published` appear close enough above it to be the condition it is under. It
 * cannot prove the condition is the right way round - only a rendered page can
 * do that - but it does catch the case it exists for, which is a fifth link
 * added by somebody who did not know about the other four.
 */

/** The link, exactly as every one of the four wrote it. */
const LINK = "href={`/p/${";

/**
 * How far back the guard may be. A conditional render in this codebase opens a
 * line or two above the element; 400 characters is a comfortable JSX block and
 * far short of the next unrelated section.
 */
const REACH = 400;

test("no dashboard screen links to a page that may not be published", () => {
  const offenders: string[] = [];

  for (const file of sources(join(import.meta.dirname, "..", "app", "dashboard"))) {
    const source = readFileSync(file, "utf8");
    let at = source.indexOf(LINK);
    while (at !== -1) {
      const before = source.slice(Math.max(0, at - REACH), at);
      if (!before.includes("published")) {
        const line = source.slice(0, at).split("\n").length;
        offenders.push(`${file.split("/app/")[1]}:${line}`);
      }
      at = source.indexOf(LINK, at + 1);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "these link to /p/{slug} with nothing checking the page is published, "
      + "so they open a 404 on the provider's own dashboard:\n"
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
