/**
 * How a moment and an amount are written for a reader.
 *
 * <p>Both take the zone or the currency explicitly. The API sends UTC instants
 * and a typed amount, and the provider's own zone and currency travel with the
 * data - so nothing here assumes Conakry or the franc, which is what would have
 * to be undone by the first provider anywhere else.
 */

export function dateTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(instant));
}

export function time(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr", { timeStyle: "short", timeZone }).format(
    new Date(instant),
  );
}

export function day(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr", { dateStyle: "full", timeZone }).format(
    new Date(instant),
  );
}

/**
 * The minor unit is the currency's own, never assumed to be hundredths: the
 * Guinean franc has no subdivision at all, so dividing by a hundred would show
 * every price a hundred times too small.
 */
export function money(amount: { amount_minor: number; currency: string }): string {
  return new Intl.NumberFormat("fr", {
    style: "currency",
    currency: amount.currency,
  }).format(amount.amount_minor / minorUnits(amount.currency));
}

function minorUnits(currency: string): number {
  const digits = new Intl.NumberFormat("fr", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return 10 ** (digits ?? 2);
}

/** ISO 8601 for a date input and for the API's date parameters. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A wall-clock reading in a named zone, turned into the instant it names.
 *
 * <p>The inverse of {@link localInput}, and the reason it exists is that
 * {@code new Date("2026-09-07T10:00")} means ten o'clock WHERE THE PROCESS IS.
 * A salon in Conakry whose server runs in Paris would have every appointment
 * booked an hour out, silently, and the launch market being UTC+0 is exactly
 * what would hide it until the first provider elsewhere.
 *
 * <p>Two passes. The first reads the zone's offset at the guessed instant; the
 * second re-reads it at the corrected one, because a reading close to a
 * transition can guess into the wrong side of it. What neither can resolve is
 * an hour that occurs twice: an autumn overlap is genuinely ambiguous and this
 * takes the first, which is what every calendar does.
 */
export function instantFromLocal(local: string, timeZone: string): string {
  const naive = Date.parse(`${local.length === 16 ? local : local.slice(0, 16)}:00Z`);
  if (Number.isNaN(naive)) {
    throw new Error(`not a local date-time: ${local}`);
  }
  let guess = naive - offsetAt(naive, timeZone);
  guess = naive - offsetAt(guess, timeZone);
  return new Date(guess).toISOString();
}

/** How far ahead of UTC the zone is at that instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Hour 24 is how this formatter writes midnight; Date.UTC takes it correctly.
  const asUtc = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour"),
    at("minute"),
    at("second"),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}
