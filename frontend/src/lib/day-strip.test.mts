import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { openWeekdays, weekday } from "./day-strip.ts";

/**
 * The numbering, and the contract that owns it.
 *
 * <p>`day_of_week` is written by the server and read here, which is the defect
 * class this repository keeps paying for. Nothing fails when the two part
 * company: a salon shut on Sunday simply draws Monday as closed, week after
 * week, on the one screen where a customer is deciding whether to come.
 */

test("Monday is 1 and Sunday is 7, as the contract numbers them", () => {
  // A known week: 2026-09-14 is a Monday.
  const monday = "2026-09-14";
  const expected = [1, 2, 3, 4, 5, 6, 7];
  const got = expected.map((_, i) =>
    weekday(`2026-09-${String(14 + i).padStart(2, "0")}`),
  );

  assert.equal(weekday(monday), 1);
  assert.deepEqual(got, expected, "the week must run Monday 1 to Sunday 7");
});

test("the contract still numbers a week the way this file reads one", () => {
  const spec = readFileSync(
    new URL(
      "../../../backend/app/src/main/resources/META-INF/openapi.yaml",
      import.meta.url,
    ),
    "utf8",
  );

  // The one sentence that fixes the numbering. If it is ever reworded away,
  // this fails here rather than on somebody's Sunday.
  assert.match(
    spec,
    /day_of_week:[\s\S]{0,200}?ISO numbering, 1 is Monday/,
    "openapi.yaml no longer states that day_of_week is ISO with Monday 1",
  );
});

test("no hours read is not a week with no hours in it", () => {
  assert.equal(openWeekdays(null), null, "unfetched hours must stay unknown");
  assert.deepEqual(
    openWeekdays({ data: [] }),
    new Set(),
    "a week with no segments is a real, empty answer",
  );
});

test("every day carrying a segment counts once", () => {
  const hours = {
    data: [
      { day_of_week: 2 },
      // The public route merges overlapping stretches but still publishes a
      // morning and an afternoon separately, so the same day arrives twice.
      { day_of_week: 4 },
      { day_of_week: 4 },
    ],
  };

  assert.deepEqual(openWeekdays(hours), new Set([2, 4]));
});
