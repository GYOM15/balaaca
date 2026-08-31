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
  redirect(`/dashboard/team?invited=${encodeURIComponent(invitation.code)}`);
}
