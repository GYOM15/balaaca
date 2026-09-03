"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { succeed, type SuccessCode } from "@/lib/feedback";
import type { ProviderProfile } from "@/lib/types";

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
 *
 * <p>`published` travels the same way, and for a sharper reason than the rest.
 * The switch that changes it is its own form now, so nothing here draws a
 * control for it - and a body that omitted it would send `false`, which means
 * correcting a typo in an address would take a live page off the directory.
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
  succeed("/dashboard/profile", "PROFILE_SAVED");
}

/**
 * Publication, on its own, because it is its own decision.
 *
 * <p>The switch used to be a field of the form above, so turning it changed
 * nothing until a save button at the other end of the page was found. It is one
 * form of one field now and it submits itself - which the contract does not
 * make easy: there is no operation that writes `published` alone, only the
 * whole-profile `PUT`. So the profile is read back and returned with this one
 * field decided, rather than carrying a copy of every other field through a
 * form that has no business holding them. A copy would also be a copy of what
 * the page held when it was drawn, and could resurrect a description the
 * provider changed in another tab.
 *
 * <p>The form sends the state it WANTS rather than a request to flip, so a page
 * left open and clicked twice lands on the same answer both times.
 *
 * <p>Refused with `INVALID_STATE_TRANSITION` while nothing is bookable. The
 * screen only offers the switch when readiness says otherwise, so this arriving
 * means the catalogue emptied under the provider between the two - and the
 * refusal names what is missing, which is the same sentence the checklist
 * beside the switch is already showing.
 */
export async function setPublished(formData: FormData): Promise<void> {
  const published = formData.get("published") === "on";

  try {
    const current = await api<ProviderProfile>("/v1/provider-profile");
    await api("/v1/provider-profile", {
      method: "PUT",
      body: { ...asRequest(current), published },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/profile?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/profile");
  succeed(
    "/dashboard/profile",
    published ? "PROFILE_PUBLISHED" : "PROFILE_UNPUBLISHED",
  );
}

/**
 * The profile as the API takes it back.
 *
 * <p>Every field of the request, because the request replaces the resource and
 * one left out here is a column cleared on the next publication. The view
 * answers a locality object where the request takes its slug; everything else
 * is the same name on both sides.
 */
function asRequest(profile: ProviderProfile) {
  return {
    business_name: profile.business_name,
    description: profile.description,
    category_slug: profile.category_slug,
    locality_slug: profile.locality?.slug,
    area: profile.area,
    city: profile.city,
    address_line: profile.address_line,
    public_phone_e164: profile.public_phone_e164,
    public_email: profile.public_email,
    whatsapp_phone_e164: profile.whatsapp_phone_e164,
    timezone: profile.timezone,
  };
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
  succeed("/dashboard/profile", "POLICY_SAVED");
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
 *
 * <p>The confirmation is a parameter because "enregistré" would have been true
 * of either one, and the whole complaint was that nothing said which.
 */
async function upload(
  formData: FormData,
  path: string,
  code: SuccessCode,
): Promise<void> {
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
  succeed("/dashboard/profile", code);
}

export async function uploadLogo(formData: FormData): Promise<void> {
  await upload(formData, "/v1/provider-profile/logo", "LOGO_SAVED");
}

export async function uploadCover(formData: FormData): Promise<void> {
  await upload(formData, "/v1/provider-profile/cover", "COVER_SAVED");
}
