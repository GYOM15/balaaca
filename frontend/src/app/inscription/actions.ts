"use server";

import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type { ProviderRegistered } from "@/lib/types";

/**
 * Registering a business.
 *
 * <p>The one authenticated call on this platform that runs with no tenant: it
 * is what puts the rows every other call resolves a tenant from. Until it has
 * run, everything else answers 403 to this account - which is what a salon
 * that has just signed up would otherwise hit forever.
 *
 * <p>Nothing about the person is sent. Their name and their address come from
 * the verified token, because a caller does not get to choose who they are.
 * The body carries three fields because the contract accepts three that this
 * form asks for, and a fourth invented here would be dropped in silence.
 */
export async function register(formData: FormData): Promise<void> {
  const businessName = String(formData.get("business_name") ?? "").trim();

  // Lower-cased rather than refused. The pattern the server enforces has no
  // capitals in it, and "Salon-Awa" is the handle the person meant - answering
  // 400 over a difference that disappears the moment it is rendered would be
  // pedantry charged to somebody signing up on a phone.
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();

  const categorySlug = String(formData.get("category_slug") ?? "").trim();

  try {
    await api<ProviderRegistered>("/v1/providers", {
      method: "POST",
      body: {
        slug,
        business_name: businessName,
        // Omitted when empty, never sent as "". The contract says to leave it
        // out if none fits, and the empty string is not a published category.
        ...(categorySlug ? { category_slug: categorySlug } : {}),
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // A session that aged out between the render and the submit is not a
      // refusal of this form, and telling the person their handle is taken
      // would send them chasing a problem they do not have.
      if (error.status === 401) redirect("/api/auth/login?next=/inscription");

      // SLUG_UNAVAILABLE and ALREADY_REGISTERED are carried back apart on
      // purpose: one is fixed by picking another handle and the other is not
      // fixed by anything, so the page must be able to say two different
      // things. What was typed comes back with them - a form that empties
      // itself on refusal asks the person to type it all again to change one
      // word, and none of these three values is private.
      redirect(refused(error.code, { slug, name: businessName, category: categorySlug }));
    }
    throw error;
  }

  // Dormant, not published: the profile page is where the business is filled
  // in and put online, and it is the only useful thing to do next.
  redirect("/dashboard/profile");
}

function refused(
  code: string | null,
  typed: { slug: string; name: string; category: string },
): string {
  const query = new URLSearchParams({ error: code ?? "UNKNOWN" });
  if (typed.slug) query.set("slug", typed.slug);
  if (typed.name) query.set("name", typed.name);
  if (typed.category) query.set("category", typed.category);
  return `/inscription?${query.toString()}`;
}
