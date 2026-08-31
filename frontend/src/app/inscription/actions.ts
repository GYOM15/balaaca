"use server";

import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";

/**
 * Registering a business.
 *
 * <p>The one authenticated call on this platform that runs with no tenant: it
 * is what puts the rows that every other call resolves a tenant from. Until it
 * has run, everything else answers 403 to this account.
 *
 * <p>Nothing about the person is sent. Their name and their address come from
 * the verified token, because a caller does not get to choose who they are.
 */
export async function register(formData: FormData): Promise<void> {
  try {
    await api("/v1/providers", {
      method: "POST",
      body: {
        slug: String(formData.get("slug")),
        business_name: String(formData.get("business_name")),
        ...(formData.get("category_slug")
          ? { category_slug: String(formData.get("category_slug")) }
          : {}),
      },
    });
  } catch (error) {
    // SLUG_UNAVAILABLE and ALREADY_REGISTERED are told apart on purpose: one is
    // fixed by choosing another handle, the other is not fixed by anything.
    if (error instanceof ApiError) {
      redirect(`/inscription?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  redirect("/dashboard/profile");
}
