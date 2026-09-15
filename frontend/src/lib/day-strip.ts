/**
 * Why a day in the booking strip is empty.
 *
 * <p>Its own module so the numbering below can be tested. The slot list says
 * only what can be booked, deliberately: a grid flagging which slots are taken
 * would be an occupancy map of a named person at a named address. So a day it
 * omits is a day the page cannot explain on its own, and the weekly hours are
 * what separate "shut on Sundays" from "booked out on Tuesday".
 */

/** The weekly hours as the public route publishes them. */
export type WeekdaySegment = { day_of_week: number };

/**
 * Which weekdays a business works at all, or null when nobody asked.
 *
 * <p>Null rather than an empty set: no hours read and a week with no hours in
 * it are opposite answers, and a set that could not tell them apart would put
 * "Fermé" on all seven days of a salon whose hours simply were not fetched.
 */
export function openWeekdays(
  hours: { data: WeekdaySegment[] } | null,
): Set<number> | null {
  return hours ? new Set(hours.data.map((segment) => segment.day_of_week)) : null;
}

/**
 * ISO day of week for a contract date: 1 is Monday, 7 is Sunday.
 *
 * <p>Two places that must agree, and this is the second one: the segments are
 * numbered by the contract, `getUTCDay` numbers Sunday 0, and an off-by-one
 * here reports the wrong day's hours - a salon shut on Sunday would draw Monday
 * as closed, every week, with nothing failing.
 *
 * <p>Read in UTC like every other reading of a date on that page. The string is
 * already the day it is at the salon; taking the weekday in the server's own
 * zone would move it by one for half of every day.
 */
export function weekday(date: string): number {
  const sunday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return sunday === 0 ? 7 : sunday;
}
