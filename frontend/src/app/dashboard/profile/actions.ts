"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";

/**
 * The public page, replaced whole.
 *
 * <p>Whole, because the API replaces it whole: a field this form omitted would
 * be a field the save cleared. The slug is absent on purpose - it is the string
 * on the QR code and there is no path through this resource that changes it.
 */
export async function saveProfile(formData: FormData): Promise<void> {
  const optional = (name: string) =>
    String(formData.get(name) ?? "").trim() || undefined;

  try {
    await api("/v1/provider-profile", {
      method: "PUT",
      body: {
        business_name: String(formData.get("business_name")),
        description: optional("description"),
        category_slug: optional("category_slug"),
        city: optional("city"),
        address_line: optional("address_line"),
        public_phone_e164: optional("public_phone_e164"),
        public_email: optional("public_email"),
        whatsapp_phone_e164: optional("whatsapp_phone_e164"),
        timezone: String(formData.get("timezone")),
        published: formData.get("published") === "on",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/profile?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/profile");
}

/**
 * How the diary runs, which is not what a customer reads.
 *
 * <p>Its own form for its own resource. Mixing the two would mean an edit to an
 * address could quietly reset a notice period - a loss nobody notices until a
 * customer books too late.
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
      redirect(`/dashboard/profile?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/profile");
}
