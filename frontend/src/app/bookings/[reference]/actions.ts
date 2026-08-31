"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, publicApi } from "@/lib/api";

/**
 * A customer calling off their own appointment.
 *
 * <p>The reference is the only thing that authorises this, and that is by
 * design: somebody who booked without an account has nothing else, and the API
 * binds the tenant from the reference itself. A reference naming nothing never
 * binds and answers the same 404 as an unknown one.
 *
 * <p>A server action rather than a fetch from the browser, like every write
 * here. It also means the button works with JavaScript switched off, which on a
 * phone in Conakry is not a hypothetical.
 */
export async function cancelBooking(formData: FormData): Promise<void> {
  const reference = String(formData.get("reference"));
  const reason = String(formData.get("reason") ?? "").trim();

  try {
    await publicApi(`/v1/bookings/${encodeURIComponent(reference)}/cancellation`, {
      method: "POST",
      // Omitted rather than empty: the field is what the provider will read in
      // their diary, and an empty string is a note that says nothing while
      // looking like a note.
      body: reason ? { reason } : {},
    });
  } catch (error) {
    // A refusal is an answer, not a fault. The deadline having just passed and
    // the appointment having just been cancelled by the salon are both real,
    // and both belong on the page as a sentence - not on the 500 screen, which
    // says the product is broken when the product simply said no.
    if (error instanceof ApiError) {
      redirect(`/bookings/${encodeURIComponent(reference)}?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }

  revalidatePath(`/bookings/${reference}`);
  // The flag is what carries "c'est fait" across the redirect. The durable
  // truth is the status the page re-reads; this only says it out loud once.
  redirect(`/bookings/${encodeURIComponent(reference)}?cancelled=1`);
}
