"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { type SuccessCode, succeed } from "@/lib/feedback";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * What each kind of exception is worth saying.
 *
 * <p>One sentence per kind rather than one for all three. "L'exception est
 * enregistrée" would be as true of a Thursday closed all day as of one hour
 * taken out of it, and those are not the same news to somebody who has just
 * declared one of them.
 */
const ADDED: Record<string, SuccessCode> = {
  TIME_OFF: "TIME_OFF_ADDED",
  CUSTOM_HOURS: "CUSTOM_HOURS_ADDED",
  CLOSED: "DAY_CLOSED",
};

/**
 * Where a verb on this screen comes back to.
 *
 * <p>Opening hours belong to a person, so landing on `/dashboard/hours` bare
 * would answer with the caller's own week - an owner who has just saved a
 * colleague's Saturday would be told it worked while looking at their own.
 */
function week(staffId: string, error?: string): string {
  const params = new URLSearchParams({ staff: staffId });
  if (error) params.set("error", error);
  return `/dashboard/hours?${params.toString()}`;
}

/**
 * The whole week, replaced.
 *
 * <p>Whole and not day by day, because the API takes it whole: a per-day edit
 * leaves the days nobody mentioned ambiguous, which is how a Saturday gets
 * emptied that nobody meant to close. So the form posts every day it knows
 * about, and a day left blank is a day off - stated, not inferred.
 */
/**
 * The hour the two lists agreed on.
 *
 * <p>The screen posts `<name>_h` and `<name>_m` rather than one time field,
 * because a native time input commits a half-typed hour on a timer and sets one
 * the provider never chose. Half a time is no time: a field left at "--" reads
 * as empty, which is how a day is declared closed.
 */
function timeOf(formData: FormData, name: string): string {
  const hour = String(formData.get(`${name}_h`) ?? "");
  const minute = String(formData.get(`${name}_m`) ?? "");
  return hour && minute ? `${hour}:${minute}` : "";
}

export async function replaceHours(formData: FormData): Promise<void> {
  const staffId = String(formData.get("staff_id"));

  const data = DAYS.flatMap((day) => {
    const start = timeOf(formData, `start_${day}`);
    const end = timeOf(formData, `end_${day}`);
    return start && end ? [{ day_of_week: day, start_time: start, end_time: end }] : [];
  });

  try {
    await api("/v1/opening-hours", {
      method: "PUT",
      body: { staff_id: staffId, data },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(week(staffId, error.code ?? "UNKNOWN"));
    }
    throw error;
  }
  revalidatePath("/dashboard/hours");
  succeed(week(staffId), "HOURS_SAVED");
}

/** A closed day, different hours, or an hour taken out of an ordinary day. */
export async function addClosure(formData: FormData): Promise<void> {
  const staffId = String(formData.get("staff_id"));
  const kind = String(formData.get("kind"));
  const start = timeOf(formData, "start_time");
  const end = timeOf(formData, "end_time");

  // Narrowed here so the confirmation can name what was declared. The dialog's
  // three radios are the only kinds this screen offers, and anything else is
  // the same refusal the API would answer with.
  const done = ADDED[kind];
  if (!done) return redirect(week(staffId, "VALIDATION_FAILED"));

  try {
    await api("/v1/closures", {
      method: "POST",
      body: {
        staff_id: staffId,
        date: String(formData.get("date")),
        kind,
        // CLOSED carries no times and the other two require both. Sent this way
        // round rather than "CUSTOM_HOURS has times", so a kind added later is
        // refused rather than quietly stored with none.
        ...(kind === "CLOSED" ? {} : { start_time: start, end_time: end }),
        ...(formData.get("reason") ? { reason: String(formData.get("reason")) } : {}),
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(week(staffId, error.code ?? "UNKNOWN"));
    }
    throw error;
  }
  revalidatePath("/dashboard/hours");
  succeed(week(staffId), done);
}

/**
 * An exception, taken back off the calendar.
 *
 * <p>The only verb on these screens that had no `catch` at all: a colleague's
 * closure refused with FORBIDDEN, or one a second tab had already deleted, came
 * out of here as an unhandled throw and the provider read the crash page. The
 * hours screen has had the sentences for both codes the whole time.
 */
export async function removeClosure(formData: FormData): Promise<void> {
  const staffId = String(formData.get("staff_id"));
  try {
    await api(`/v1/closures/${encodeURIComponent(String(formData.get("id")))}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(week(staffId, error.code ?? "UNKNOWN"));
    }
    throw error;
  }
  revalidatePath("/dashboard/hours");
  succeed(week(staffId), "CLOSURE_REMOVED");
}
