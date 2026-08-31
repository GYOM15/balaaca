"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * The whole week, replaced.
 *
 * <p>Whole and not day by day, because the API takes it whole: a per-day edit
 * leaves the days nobody mentioned ambiguous, which is how a Saturday gets
 * emptied that nobody meant to close. So the form posts every day it knows
 * about, and a day left blank is a day off - stated, not inferred.
 */
export async function replaceHours(formData: FormData): Promise<void> {
  const staffId = String(formData.get("staff_id"));

  const data = DAYS.flatMap((day) => {
    const start = String(formData.get(`start_${day}`) ?? "");
    const end = String(formData.get(`end_${day}`) ?? "");
    return start && end ? [{ day_of_week: day, start_time: start, end_time: end }] : [];
  });

  try {
    await api("/v1/opening-hours", {
      method: "PUT",
      body: { staff_id: staffId, data },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/hours?staff=${staffId}&error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/hours");
}

/** A closed day, different hours, or an hour taken out of an ordinary day. */
export async function addClosure(formData: FormData): Promise<void> {
  const staffId = String(formData.get("staff_id"));
  const kind = String(formData.get("kind"));
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");

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
      redirect(`/dashboard/hours?staff=${staffId}&error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/hours");
}

export async function removeClosure(formData: FormData): Promise<void> {
  await api(`/v1/closures/${encodeURIComponent(String(formData.get("id")))}`, {
    method: "DELETE",
  });
  revalidatePath("/dashboard/hours");
}
