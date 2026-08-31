"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type { StaffInvitation } from "@/lib/types";

async function write(formData: FormData, path: string, method: string): Promise<void> {
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
}

export async function addMember(formData: FormData): Promise<void> {
  await write(formData, "/v1/staff", "POST");
}

export async function replaceMember(formData: FormData): Promise<void> {
  await write(formData, `/v1/staff/${encodeURIComponent(String(formData.get("id")))}`, "PUT");
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
  redirect(`/dashboard/team?given=${encodeURIComponent(name)}`);
}

/**
 * A code that lets a member sign in.
 *
 * <p>Returned once and stored nowhere, so it is put straight in the URL the
 * owner lands on: they have to read it off the screen and pass it on. Issuing
 * another replaces it, which is also how to revoke one.
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
  const name = String(formData.get("name") ?? "");
  redirect(
    `/dashboard/team?invited=${encodeURIComponent(invitation.code)}` +
      (name ? `&name=${encodeURIComponent(name)}` : ""),
  );
}
