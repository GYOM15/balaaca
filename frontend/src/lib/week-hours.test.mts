import { strict as assert } from "node:assert";
import { test } from "node:test";
import { weekFrom } from "./week-hours.ts";

/**
 * The week a form posted, and the one way this can destroy something.
 *
 * <p>An unticked checkbox posts NOTHING. So a week where every day is closed
 * and a form that has no checkboxes in it at all reach the server as the same
 * absence - and the second one is a page somebody left open across a
 * deployment. Reading it as the first replaces a full week with an empty one,
 * for somebody who pressed Enregistrer on a screen that looked entirely
 * normal, and the API reports success.
 */

/** The old form: times only, no ticks, no marker. What a stale page posts. */
function stale(): FormData {
  const form = new FormData();
  form.set("staff_id", "s-1");
  for (const day of [1, 2, 3, 4, 5]) {
    form.set(`start_${day}_h`, "09");
    form.set(`start_${day}_m`, "00");
    form.set(`end_${day}_h`, "18");
    form.set(`end_${day}_m`, "00");
  }
  return form;
}

/** The current form: a marker, one `open` per ticked day, and the times. */
function ticked(days: number[], times = true): FormData {
  const form = stale();
  form.set("week_form", "ticked");
  for (const day of days) form.append("open", String(day));
  if (!times) {
    for (const day of days) {
      form.set(`start_${day}_h`, "");
      form.set(`start_${day}_m`, "");
      form.set(`end_${day}_h`, "");
      form.set(`end_${day}_m`, "");
    }
  }
  return form;
}

test("a page left open across a deployment does not wipe the week", () => {
  // No marker, so the old rule applies: both times present means open. If this
  // ever returns an empty week, a provider loses every hour they had.
  const posted = weekFrom(stale());
  assert.equal(posted.refusal, undefined);
  assert.deepEqual(
    posted.segments?.map((s) => s.day_of_week),
    [1, 2, 3, 4, 5],
  );
});

test("only the ticked days travel", () => {
  const posted = weekFrom(ticked([1, 2, 3]));
  assert.deepEqual(
    posted.segments?.map((s) => s.day_of_week),
    [1, 2, 3],
  );
});

test("unticking a day closes it even though its hours are still in the boxes", () => {
  // This is the whole point of the tick: closing a Sunday is one tap, not four
  // lists put back to "--". The times stay on screen and mean nothing.
  const posted = weekFrom(ticked([1, 2, 3, 4]));
  assert.equal(posted.segments?.some((s) => s.day_of_week === 5), false);
});

test("a week genuinely closed everywhere is an empty week, not a refusal", () => {
  const posted = weekFrom(ticked([]));
  assert.deepEqual(posted.segments, []);
  assert.equal(posted.refusal, undefined);
});

test("a day ticked open with no hours is refused, never stored closed", () => {
  // Somebody meant to open it and has not said when. Storing it as closed
  // answers a question they did not ask; dropping it is how a Saturday
  // disappears.
  const posted = weekFrom(ticked([6], false));
  assert.equal(posted.refusal, "HOURS_DAY_WITHOUT_TIMES");
  assert.equal(posted.segments, undefined);
});

test("half a time is no time", () => {
  const form = ticked([1]);
  form.set("end_1_m", "");
  assert.equal(weekFrom(form).refusal, "HOURS_DAY_WITHOUT_TIMES");
});

test("the times are put back together as the contract wants them", () => {
  const posted = weekFrom(ticked([1]));
  assert.deepEqual(posted.segments?.[0], {
    day_of_week: 1,
    start_time: "09:00",
    end_time: "18:00",
  });
});
