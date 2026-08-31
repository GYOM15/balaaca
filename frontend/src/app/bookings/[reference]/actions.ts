"use server";

import { revalidatePath } from "next/cache";
import { publicApi } from "@/lib/api";

/**
 * A customer calling off their own appointment.
 *
 * <p>The reference is the only thing that authorises this, and that is by
 * design: somebody who booked without an account has nothing else, and the API
 * binds the tenant from the reference itself. A reference naming nothing never
 * binds and answers the same 404 as an unknown one.
 */
export async function cancel(formData: FormData): Promise<void> {
  const reference = String(formData.get("reference"));
  await publicApi(`/v1/bookings/${encodeURIComponent(reference)}/cancellation`, {
    method: "POST",
    body: { reason: String(formData.get("reason") ?? "") || undefined },
  });
  revalidatePath(`/bookings/${reference}`);
}
