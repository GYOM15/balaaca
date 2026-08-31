"use server";

import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";

/**
 * Redeeming an invitation.
 *
 * <p>Authenticated and tenant-free, like registration and for the same reason:
 * the caller has no membership and this is what gives them one.
 *
 * <p>An unknown code, an expired one, one already used and one belonging to a
 * suspended business all answer the same 404 - so this says one thing back.
 * Telling them apart would say whether a code ever existed to anyone guessing.
 */
export async function join(formData: FormData): Promise<void> {
  const code = String(formData.get("code")).trim();
  try {
    await api(`/v1/invitations/${encodeURIComponent(code)}/acceptance`, { method: "POST" });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/rejoindre?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  redirect("/dashboard");
}
