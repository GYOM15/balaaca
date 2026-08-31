"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";

/**
 * What the provider remembers about somebody.
 *
 * <p>Their own note, and nobody else's: it is never shown to the customer and
 * never sent anywhere. It is the line a salon writes to remember that somebody
 * is allergic to a product, or always arrives ten minutes late.
 *
 * <p>Cleared by an empty body rather than by a delete, because that is what the
 * contract offers - and a note of nothing but spaces is cleared too, since it
 * would render as a card that looks annotated and says nothing.
 */
export async function saveNotes(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const notes = String(formData.get("notes") ?? "").trim();
  // Carried so a refusal lands back on the card the provider opened, with the
  // search that led them there still in the URL behind it.
  const q = String(formData.get("q") ?? "");
  const path = `/dashboard/customers/${encodeURIComponent(id)}`;

  try {
    await api(`/v1/customers/${encodeURIComponent(id)}/notes`, {
      method: "PUT",
      body: notes ? { notes } : {},
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const back = new URLSearchParams({ error: error.code ?? "UNKNOWN" });
      if (q) back.set("q", q);
      redirect(`${path}?${back.toString()}`);
    }
    throw error;
  }
  revalidatePath(path);
}
