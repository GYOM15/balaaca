import assert from "node:assert/strict";
import { test } from "node:test";
import { instantFromLocal, money } from "./format.ts";

/**
 * The one piece of logic on this side that can be silently wrong.
 *
 * <p>Everything else here is a fetch and a template. This turns a wall-clock
 * reading into an instant, and getting it wrong moves every appointment by an
 * hour with nothing to show for it - so it is exercised where it can actually
 * fail, which is not the launch market. Guinea is UTC+0 with no daylight
 * saving: a version of this that simply ignored the zone would pass every test
 * written against Conakry.
 */
test("a wall clock in a zone names the instant that zone reads that way", () => {
  assert.equal(
    instantFromLocal("2026-09-07T10:00", "Africa/Conakry"),
    "2026-09-07T10:00:00.000Z",
  );
  assert.equal(
    instantFromLocal("2026-09-07T10:00", "Europe/Paris"),
    "2026-09-07T08:00:00.000Z",
  );
  // Winter, so the same reading is a different instant.
  assert.equal(
    instantFromLocal("2026-01-15T10:00", "Europe/Paris"),
    "2026-01-15T09:00:00.000Z",
  );
  // Behind UTC, and a zone that is not a whole number of hours from it.
  assert.equal(
    instantFromLocal("2026-09-07T10:00", "America/New_York"),
    "2026-09-07T14:00:00.000Z",
  );
  assert.equal(
    instantFromLocal("2026-09-07T10:00", "Asia/Kolkata"),
    "2026-09-07T04:30:00.000Z",
  );
});

test("a reading beside a daylight saving transition lands on the right side", () => {
  // Paris falls back on 2026-10-25: 01:30 local happens twice, and this takes
  // the first, which is what every calendar does with an ambiguous reading.
  assert.equal(
    instantFromLocal("2026-10-25T01:30", "Europe/Paris"),
    "2026-10-24T23:30:00.000Z",
  );
  // And springs forward on 2026-03-29. 03:30 exists once, after the gap - the
  // case a single-pass offset guess gets wrong.
  assert.equal(
    instantFromLocal("2026-03-29T03:30", "Europe/Paris"),
    "2026-03-29T01:30:00.000Z",
  );
});

test("an amount is scaled by its own currency, never by a hundred", () => {
  // The Guinean franc has no subdivision at all. Dividing by a hundred, which
  // is what "cents" assumes, would show every price a hundred times too small.
  assert.equal(money({ amount_minor: 150_000, currency: "GNF" }).replace(/\s/g, " "),
               new Intl.NumberFormat("fr", { style: "currency", currency: "GNF" })
                 .format(150_000).replace(/\s/g, " "));
});
