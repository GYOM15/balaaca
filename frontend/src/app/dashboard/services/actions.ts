"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { succeed } from "@/lib/feedback";
import type { Fulfilment } from "@/lib/types";

/**
 * The modes, in the contract's own order.
 *
 * <p>The form is filtered against this rather than forwarded: it fixes the
 * order a set has none of, and a value that is not one of the three never
 * reaches the API at all.
 */
const FULFILMENTS: Fulfilment[] = ["ON_SITE", "DROP_OFF", "AT_CUSTOMER"];

/** Every mode the provider ticked. */
function modesFrom(formData: FormData): Fulfilment[] {
  const ticked = new Set(formData.getAll("fulfilments").map(String));
  return FULFILMENTS.filter((mode) => ticked.has(mode));
}

/**
 * The editor a save comes back to when it is refused.
 *
 * <p>A refusal used to land on the bare list, which drew the sentence above a
 * catalogue and not above the form it was about - the provider read why the
 * save failed on a screen with nothing left to correct.
 */
function editorUrl(id: string | undefined, refusal?: string): string {
  const editor = `/dashboard/services?edit=${encodeURIComponent(id ?? "new")}`;
  return refusal ? `${editor}&error=${refusal}` : editor;
}

/**
 * A service, created or replaced whole.
 *
 * <p>Replaced and never patched: the API takes the whole offering, so a field
 * left out of an edit would be a field cleared rather than a field kept. The
 * form therefore carries every one of them, filled from what is stored.
 *
 * <p>`location` is not written at all. It is the deprecated spelling of the
 * same fact and the API refuses the two together, so a form that speaks the
 * set speaks only the set.
 */
async function write(formData: FormData, path: string, method: string): Promise<void> {
  const id = formData.get("id") ? String(formData.get("id")) : undefined;
  const fulfilments = modesFrom(formData);

  // The page says this before the button is pressed; this says it again for the
  // post that arrives without a mode anyway. It cannot be left to the API: an
  // empty array is indistinguishable there from an omitted one, an omitted one
  // is the deprecated single-location path, and that path reads "no mode" as
  // ON_SITE. A provider who unticked all three would be told their service was
  // saved - as something they never asked for.
  if (fulfilments.length === 0) {
    redirect(editorUrl(id, "VALIDATION_FAILED"));
  }

  try {
    await api(path, {
      method,
      body: {
        name: String(formData.get("name")),
        description: String(formData.get("description") ?? "") || undefined,
        duration_minutes: Number(formData.get("duration_minutes")),
        buffer_before_minutes: Number(formData.get("buffer_before_minutes") ?? 0),
        buffer_after_minutes: Number(formData.get("buffer_after_minutes") ?? 0),
        fulfilments,
        // The delay is the promise attached to one mode. The API requires it
        // with DROP_OFF and refuses it without, so a figure typed before
        // unticking Dépôt is dropped here rather than sent beside a set that
        // contradicts it.
        turnaround_hours: fulfilments.includes("DROP_OFF")
          ? Number(formData.get("turnaround_hours"))
          : undefined,
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
      redirect(editorUrl(id, error.code ?? "UNKNOWN"));
    }
    throw error;
  }
  revalidatePath("/dashboard/services");
}

export async function createService(formData: FormData): Promise<void> {
  await write(formData, "/v1/service-offerings", "POST");
  // The catalogue, because the service now has a row in it and reopening the
  // empty editor is what made a creation look like it had not happened.
  succeed("/dashboard/services", "SERVICE_CREATED");
}

export async function replaceService(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await write(formData, `/v1/service-offerings/${encodeURIComponent(id)}`, "PUT");
  succeed(editorUrl(id), "SERVICE_SAVED");
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
  const panel = `/dashboard/services?performers=${encodeURIComponent(id)}`;
  try {
    await api(`/v1/service-offerings/${encodeURIComponent(id)}/performers`, {
      method: "PUT",
      body: { staff_ids: formData.getAll("staff_ids").map(String) },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // The service travels with the refusal: the panel is opened by that
      // parameter, so dropping it would close the list the message is about.
      redirect(`${panel}&performer_error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/services");
  // Landing on the panel again also drops whatever `performer_error` the URL
  // still carried, which would show a refusal over a save that worked.
  succeed(panel, "PERFORMERS_SAVED");
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
  // Landing on the panel again also drops whatever `photo_error` the URL still
  // carried, which would show a refusal over an upload that worked.
  succeed(photosUrl(id), "PHOTO_ADDED");
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
  succeed(photosUrl(id), "PHOTO_REMOVED");
}
