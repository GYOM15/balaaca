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

/**
 * The same capability, used to move the appointment instead of giving it up.
 *
 * <p>Without this a customer who needs Thursday has to cancel Wednesday and
 * book again, which releases the slot to whoever refreshes first - so the
 * customer loses their place for asking to keep it.
 *
 * <p>Only the start is sent. The end, the service and the colleague are the
 * appointment's own and the server recomputes from them; a client allowed to
 * restate the window could shrink its own footprint and land inside somebody
 * else's hour.
 */
export async function rescheduleBooking(formData: FormData): Promise<void> {
  const reference = String(formData.get("reference"));
  const startsAt = String(formData.get("starts_at"));
  const week = String(formData.get("date") ?? "");

  try {
    await publicApi(`/v1/bookings/${encodeURIComponent(reference)}/reschedule`, {
      method: "POST",
      body: { starts_at: startsAt },
    });
  } catch (error) {
    // A refusal comes back to the slot list, still open and on the week the
    // customer was reading. `SLOT_UNAVAILABLE` means "somebody took it, pick
    // another", and a page with no slots on it cannot say that.
    if (error instanceof ApiError) {
      const query = new URLSearchParams({
        move: "1",
        move_error: error.code ?? "UNKNOWN",
      });
      if (week) query.set("date", week);
      redirect(`/bookings/${encodeURIComponent(reference)}?${query.toString()}`);
    }
    throw error;
  }

  revalidatePath(`/bookings/${reference}`);
  redirect(`/bookings/${encodeURIComponent(reference)}?moved=1`);
}

/**
 * Telling the platform that a business let this customer down.
 *
 * <p>Reachable from a reference and from nowhere else, which is the whole
 * design of the operation: a report button on a public page is something a
 * competitor three streets away can press from a script all night, and this
 * one can only be pressed by somebody who actually booked.
 *
 * <p>Pressing it twice is the same report, so nothing here guards against a
 * second submission - a retry after a dropped connection must be safe, and
 * making the customer wonder whether it went through would be worse.
 */
export async function reportProvider(formData: FormData): Promise<void> {
  const reference = String(formData.get("reference"));
  // Passed through as written. The reason is a closed set the API validates,
  // and a copy of that set here would be a second statement of the contract
  // that can drift from the first.
  const reason = String(formData.get("reason") ?? "");
  const details = String(formData.get("details") ?? "").trim();

  try {
    await publicApi(`/v1/bookings/${encodeURIComponent(reference)}/report`, {
      method: "POST",
      body: details ? { reason, details } : { reason },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(
        `/bookings/${encodeURIComponent(reference)}?report=1&report_error=${error.code ?? "UNKNOWN"}`,
      );
    }
    // The operation answers 202 with no body at all, and `call` in lib/api only
    // skips the parse for a 204 - so a report that was filed arrives back here
    // as a parse failure on a payload that was never sent. The request
    // succeeded; only the reading of nothing did not. Anything else rethrows.
    if (!(error instanceof SyntaxError)) throw error;
  }

  // Nothing to revalidate: the booking did not change, and the report is not a
  // resource this customer can go and read - which is what the 202 says.
  redirect(`/bookings/${encodeURIComponent(reference)}?reported=1`);
}
