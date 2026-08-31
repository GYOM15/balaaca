"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type { ServiceLocation } from "@/lib/types";

/**
 * The shape of the transaction, from the one control that picks it.
 *
 * <p>`turnaround_hours` and `location: AT_CUSTOMER` are exclusive, and a
 * request carrying both is answered 400. So the form does not carry the two
 * fields at all: it carries the single shape a provider chose, and this writes
 * whichever of the pair that shape means. A delay typed before changing one's
 * mind is dropped here rather than sent alongside a location that contradicts
 * it - the refused combination is one the form cannot express.
 */
function shapeFrom(formData: FormData): {
  turnaround_hours: number | undefined;
  location: ServiceLocation | undefined;
} {
  const shape = String(formData.get("fulfilment") ?? "ON_SITE");
  return {
    turnaround_hours:
      shape === "DROP_OFF" ? Number(formData.get("turnaround_hours")) : undefined,
    location: shape === "AT_CUSTOMER" ? "AT_CUSTOMER" : undefined,
  };
}

/**
 * A service, created or replaced whole.
 *
 * <p>Replaced and never patched: the API takes the whole offering, so a field
 * left out of an edit would be a field cleared rather than a field kept. The
 * form therefore carries every one of them, filled from what is stored.
 */
async function write(formData: FormData, path: string, method: string): Promise<void> {
  try {
    await api(path, {
      method,
      body: {
        name: String(formData.get("name")),
        description: String(formData.get("description") ?? "") || undefined,
        duration_minutes: Number(formData.get("duration_minutes")),
        buffer_before_minutes: Number(formData.get("buffer_before_minutes") ?? 0),
        buffer_after_minutes: Number(formData.get("buffer_after_minutes") ?? 0),
        ...shapeFrom(formData),
        price: {
          // The minor unit is the currency's own. The franc has no
          // subdivision, so what is typed is what is stored - and dividing by a
          // hundred here would be wrong in exactly the way "cents" is wrong
          // everywhere else in this product.
          amount_minor: Number(formData.get("amount_minor")),
          // Carried by the form, because the price belongs to the service and
          // nothing above it holds a currency. Defaulted from what the provider
          // already sells in rather than pinned to one market.
          currency: String(formData.get("currency")),
        },
        price_visible: formData.get("price_visible") === "on",
        sort_order: Number(formData.get("sort_order") ?? 0),
        active: formData.get("active") === "on",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/services?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/services");
}

export async function createService(formData: FormData): Promise<void> {
  await write(formData, "/v1/service-offerings", "POST");
}

export async function replaceService(formData: FormData): Promise<void> {
  await write(
    formData,
    `/v1/service-offerings/${encodeURIComponent(String(formData.get("id")))}`,
    "PUT",
  );
}

/**
 * Who may take a booking for one service.
 *
 * <p>The whole set every time, like the offering itself. Competence is strict
 * on the server - somebody absent from this list cannot be booked for this
 * service at all - so an unticked box is a removal, and sending only what
 * changed would read as removing everybody it left out.
 *
 * <p>Unticked checkboxes send nothing, which is precisely what makes `getAll`
 * the set the provider is looking at.
 */
export async function replacePerformers(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  try {
    await api(`/v1/service-offerings/${encodeURIComponent(id)}/performers`, {
      method: "PUT",
      body: { staff_ids: formData.getAll("staff_ids").map(String) },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // The service travels with the refusal: the panel is opened by that
      // parameter, so dropping it would close the list the message is about.
      redirect(
        `/dashboard/services?performers=${encodeURIComponent(id)}` +
          `&performer_error=${error.code ?? "UNKNOWN"}`,
      );
    }
    throw error;
  }
  revalidatePath("/dashboard/services");
  // Re-rendering in place would keep whatever `performer_error` the URL still
  // carries, showing a refusal over a save that worked.
  redirect(`/dashboard/services?performers=${encodeURIComponent(id)}`);
}

/**
 * What the API stores, and what this refuses before spending a request on it.
 *
 * <p>The same five megabytes `SanitisedImage` enforces. Repeated here because a
 * provider photographing braids on a telephone will exceed it, and being told
 * so by a page they are already looking at is cheaper than a round trip - and
 * far cheaper than the upload itself over 3G.
 */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The photographs panel, which is a place and not a flash message. */
function photosUrl(id: string, refusal?: string): string {
  const panel = `/dashboard/services?photos=${encodeURIComponent(id)}`;
  return refusal ? `${panel}&photo_error=${refusal}#svc-${id}` : `${panel}#svc-${id}`;
}

/**
 * A photograph, added to one service.
 *
 * <p>The contract takes the BYTES, with their type in Content-Type - no
 * multipart, no filename, exactly as the logo does. The form is multipart
 * because that is how a browser sends a file at all; this unwraps it and
 * forwards the bytes alone.
 *
 * <p>Type and size are checked here as well as by the server, and for a
 * different reason: the server reads the first bytes because a declared type is
 * a claim, while this only spares a provider being told their PDF is not a
 * photograph after uploading it.
 */
export async function addServicePhoto(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) {
    redirect(photosUrl(id, "NO_FILE"));
  }
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    redirect(photosUrl(id, "NOT_AN_IMAGE"));
  }
  if (file.size > MAX_PHOTO_BYTES) {
    redirect(photosUrl(id, "TOO_LARGE"));
  }

  try {
    await api(`/v1/service-offerings/${encodeURIComponent(id)}/photos`, {
      method: "POST",
      bytes: { data: await file.arrayBuffer(), contentType: file.type },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // A full service and an unreadable file both answer VALIDATION_FAILED,
      // and only the status tells them apart - 422 for the cap, 400 for the
      // bytes. Branching on the code alone would leave one message vague
      // enough to cover both, which is how "réessayez" gets written.
      redirect(
        photosUrl(id, error.status === 422 ? "PHOTOS_FULL" : (error.code ?? "UNKNOWN")),
      );
    }
    throw error;
  }
  revalidatePath("/dashboard/services");
  // Re-rendering in place would keep whatever `photo_error` the URL still
  // carries, showing a refusal over an upload that worked.
  redirect(photosUrl(id));
}

/**
 * A photograph, removed.
 *
 * <p>The freed slot is not backfilled and this client does not pretend
 * otherwise: positions stay where they are, and the next upload takes the
 * lowest empty one. Removing the first is therefore the only way to change
 * which photograph represents the service, which is worth saying out loud on
 * the page rather than discovering.
 */
export async function removeServicePhoto(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const photoId = String(formData.get("photo_id"));
  try {
    await api(
      `/v1/service-offerings/${encodeURIComponent(id)}` +
        `/photos/${encodeURIComponent(photoId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(photosUrl(id, error.code ?? "UNKNOWN"));
    }
    throw error;
  }
  revalidatePath("/dashboard/services");
  redirect(photosUrl(id));
}
