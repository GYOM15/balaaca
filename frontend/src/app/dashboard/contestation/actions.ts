"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";

/**
 * The one message a suspended business is allowed to send back.
 *
 * <p>One per suspension, which the API enforces with a 409. Nothing here
 * retries or replaces: a provider who pressed twice meant it once, and the
 * message the operator is already reading is the one that counts.
 */
export async function contest(formData: FormData): Promise<void> {
  try {
    await api("/v1/provider-profile/contestation", {
      method: "POST",
      // Trimmed before it goes, because `required` on the textarea is happy
      // with a space and the contract's minimum length is not. Sending the
      // space would be refused a layer deeper, where the refusal is no longer
      // one of the ones this page can explain.
      body: { message: String(formData.get("message") ?? "").trim() },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // Two different refusals answer VALIDATION_FAILED - 400 for a message the
      // contract will not take, 422 for a suspension that no longer exists - so
      // the status settles it. Telling a provider whose page has just come back
      // online to check their wording would be the one wrong thing to say.
      const refusal =
        error.status === 422 ? "NOT_SUSPENDED" : (error.code ?? "UNKNOWN");
      // The code travels and the message never does: it names a decision and
      // argues against it, and a redirect writes what it carries into the
      // address bar, the history and every log between here and the browser.
      redirect(`/dashboard/contestation?error=${refusal}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/contestation");
  // Re-rendering in place would keep whatever `error` the URL still carries,
  // showing a refusal over a message that was filed.
  redirect("/dashboard/contestation");
}
