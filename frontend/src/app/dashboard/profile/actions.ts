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
 *
 * <p>The place is two fields and not one. `locality_slug` is checked against
 * the published map and refused when it is not on it, which is what makes the
 * directory's filter find this business; `area` is free text, because Guinea's
 * quartiers are not a list this platform owns. `city` is deprecated and carried
 * by a hidden field: it is still what the directory card prints, so dropping it
 * from the body would blank the place of every provider who has not yet chosen
 * a commune.
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
        locality_slug: optional("locality_slug"),
        area: optional("area"),
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

/**
 * The logo and the cover.
 *
 * <p>The contract takes the BYTES, with their type in Content-Type - no
 * multipart, no filename. The form is multipart because that is how a browser
 * sends a file at all; this unwraps it and forwards the bytes alone.
 *
 * <p>The type is checked here as well as by the server, and for a different
 * reason: the server checks the first two bytes because a declared type is a
 * claim, while this one only spares a provider a round trip to be told their
 * PDF is not a photograph.
 */
async function upload(formData: FormData, path: string): Promise<void> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/dashboard/profile?error=NO_FILE");
  }
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    redirect("/dashboard/profile?error=NOT_AN_IMAGE");
  }

  try {
    await api(path, {
      method: "POST",
      bytes: { data: await file.arrayBuffer(), contentType: file.type },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/profile?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/profile");
}

export async function uploadLogo(formData: FormData): Promise<void> {
  await upload(formData, "/v1/provider-profile/logo");
}

export async function uploadCover(formData: FormData): Promise<void> {
  await upload(formData, "/v1/provider-profile/cover");
}
