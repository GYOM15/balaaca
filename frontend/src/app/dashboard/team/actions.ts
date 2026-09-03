"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { type SuccessCode, succeed } from "@/lib/feedback";
import type { StaffInvitation } from "@/lib/types";

async function write(
  formData: FormData,
  path: string,
  method: string,
  done: SuccessCode,
): Promise<void> {
  try {
    await api(path, {
      method,
      body: {
        display_name: String(formData.get("display_name")),
        bookable: formData.get("bookable") === "on",
        active: formData.get("active") === "on",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/team?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/team");
  succeed("/dashboard/team", done);
}

export async function addMember(formData: FormData): Promise<void> {
  await write(formData, "/v1/staff", "POST", "MEMBER_ADDED");
}

/**
 * One PUT, two pieces of news.
 *
 * <p>The edit dialog and the deactivate dialog both replace the whole row, so
 * the request cannot tell them apart - a departure and a corrected spelling
 * arrive identically. The form says which it was, because "la fiche est à jour"
 * after pressing Désactiver confirms something the provider did not do.
 */
export async function replaceMember(formData: FormData): Promise<void> {
  const done: SuccessCode =
    formData.get("intent") === "deactivate" ? "MEMBER_DEACTIVATED" : "MEMBER_SAVED";
  await write(
    formData,
    `/v1/staff/${encodeURIComponent(String(formData.get("id")))}`,
    "PUT",
    done,
  );
}

/**
 * The business, handed to a colleague.
 *
 * <p>One way from here. The caller stops being the owner in the same statement
 * and only the new owner can hand it back, so the page says that before the
 * button rather than after it.
 *
 * <p>The refusal lands on its own parameter: `VALIDATION_FAILED` means "not an
 * active colleague with an account, or yourself" here, and "il faut un nom" on
 * the same page's other forms.
 *
 * <p>`given` survives alongside the confirmation. The toast is gone in five
 * seconds and what it announces is irreversible, so the consequences stay on
 * the page underneath it rather than travelling with it.
 */
export async function transferOwnership(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  try {
    await api(`/v1/staff/${encodeURIComponent(id)}/ownership`, { method: "POST" });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/team?transfer=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  // The layout and not only this page: the sidebar decides which rooms exist
  // from the caller's role, and the caller's role is what just changed.
  revalidatePath("/dashboard", "layout");
  const name = String(formData.get("name") ?? "");
  succeed(`/dashboard/team?given=${encodeURIComponent(name)}`, "OWNERSHIP_TRANSFERRED");
}

/**
 * A code that lets a member sign in.
 *
 * <p>Returned once and stored nowhere, so it is put straight in the URL the
 * owner lands on: they have to read it off the screen and pass it on. Issuing
 * another replaces it, which is also how to revoke one.
 *
 * <p>No toast, and deliberately: the code IS the confirmation, it is shown once
 * and it has to stay on the screen long enough to be copied into WhatsApp. A
 * four-second announcement over the top of it would say less than the notice
 * already says and would train the eye away from the one thing that matters.
 *
 * <p>The expiry travels too. Seven days is the server's, not this screen's, and
 * an owner who reads a code out on Monday deserves to know it stops working -
 * it was in the response all along and was being thrown away here.
 */
export async function invite(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  let invitation: StaffInvitation;
  try {
    invitation = await api<StaffInvitation>(
      `/v1/staff/${encodeURIComponent(id)}/invitation`,
      { method: "POST" },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/team?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  // The name travels with the code so the notice can say who to give it to.
  // It is the provider's own staff list either way - nothing is disclosed by
  // putting it in their own URL.
  const back = new URLSearchParams({ invited: invitation.code });
  const name = String(formData.get("name") ?? "");
  if (name) back.set("name", name);
  if (invitation.expires_at) back.set("until", invitation.expires_at);
  // Said out loud as well as shown. Minting a code sends nothing to anybody,
  // and the one action on this screen that a provider is most likely to
  // believe was an invitation is exactly this one.
  succeed(`/dashboard/team?${back.toString()}`, "ACCESS_CODE_CREATED");
}
