/**
 * The week a form posted, turned into the segments the contract takes.
 *
 * <p>Its own module, and not a few lines inside `actions.ts`, for the reason
 * `profile-request.ts` is: a `"use server"` file imports `next/cache` and
 * cannot be loaded by the test runner, and this is the part where getting it
 * wrong deletes somebody's week.
 */

/** One opening segment, exactly as `PUT /v1/opening-hours` takes it. */
export type WeekSegment = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

/** Either the week to send, or the one thing worth refusing before sending. */
export type WeekResult =
  | { segments: WeekSegment[]; refusal?: undefined }
  | { segments?: undefined; refusal: "HOURS_DAY_WITHOUT_TIMES" };

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * The hour the two lists agreed on.
 *
 * <p>The screen posts `<name>_h` and `<name>_m` rather than one time field,
 * because a native time input commits a half-typed hour on a timer and sets one
 * the provider never chose. Half a time is no time.
 */
export function timeOf(form: FormData, name: string): string {
  const hour = String(form.get(`${name}_h`) ?? "");
  const minute = String(form.get(`${name}_m`) ?? "");
  return hour && minute ? `${hour}:${minute}` : "";
}

/**
 * Which days are open, and when.
 *
 * <p>The screen posts one `open` per day the provider ticked, and an UNTICKED
 * checkbox posts NOTHING AT ALL. So "every day is closed" and "this form has
 * no ticks in it to begin with" arrive here as the same absence, and they are
 * not the same thing: the first is a week off, the second is a page that was
 * left open across a deployment. Reading the second as the first would replace
 * a full week with an empty one for somebody who pressed Enregistrer on a
 * screen that looked entirely normal - no warning, nothing to undo it, and the
 * API would report success.
 *
 * <p>So the form declares its own shape in a hidden field, and a form that
 * does not declare it falls back to the rule it was written under: a day
 * carrying both times is open. That is what makes this safe to deploy while
 * somebody is looking at the old page.
 *
 * <p>A day ticked open with no hours is refused rather than stored closed.
 * Storing it would answer a question nobody asked, and dropping it silently is
 * how a Saturday disappears.
 */
export function weekFrom(form: FormData): WeekResult {
  const ticked = form.get("week_form") === "ticked";
  const open = new Set(form.getAll("open").map((value) => Number(value)));

  const segments: WeekSegment[] = [];
  for (const day of DAYS) {
    if (ticked && !open.has(day)) continue;

    const start = timeOf(form, `start_${day}`);
    const end = timeOf(form, `end_${day}`);
    if (start && end) {
      segments.push({ day_of_week: day, start_time: start, end_time: end });
      continue;
    }
    if (ticked) return { refusal: "HOURS_DAY_WITHOUT_TIMES" };
  }
  return { segments };
}
