"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { succeed } from "@/lib/feedback";

/**
 * How the diary runs, which is not what a customer reads.
 *
 * <p>One writer, and only one. PUT /v1/booking-policy replaces the resource
 * whole, so a second screen editing the same five fields would be a second
 * chance to drop one. The profile card that used to do this is gone; the two
 * fields it alone could set are drawn on this screen now rather than carried
 * through it unseen.
 */
export async function savePolicy(formData: FormData): Promise<void> {
  try {
    await api("/v1/booking-policy", {
      method: "PUT",
      body: {
        slot_granularity_minutes: Number(formData.get("slot_granularity_minutes")),
        min_lead_time_minutes: Number(formData.get("min_lead_time_minutes")),
        max_advance_days: Number(formData.get("max_advance_days")),
        cancellation_deadline_minutes: Number(formData.get("cancellation_deadline_minutes")),
        auto_confirm: formData.get("auto_confirm") === "on",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/reglages?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/reglages");
  succeed("/dashboard/reglages", "POLICY_SAVED");
}
