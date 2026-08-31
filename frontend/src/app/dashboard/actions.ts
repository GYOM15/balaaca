"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { instantFromLocal } from "@/lib/format";
import type { ProviderProfile } from "@/lib/types";

/**
 * Everything the agenda can do to an appointment.
 *
 * <p>Each one is a capability the API publishes as its own operation, not a
 * status field this form sets: the state machine stays inside, and what a
 * provider expresses is the thing they want to happen.
 */

/**
 * The filters the diary was being read through when the form was submitted.
 *
 * <p>Copied key by key rather than passed through: `back` is a hidden field, so
 * it is whatever the browser sent, and rebuilding the query from a known list
 * means a crafted value can add nothing to the URL a person lands on.
 */
const CARRIED = ["from", "to", "staff", "status", "cursor"] as const;

function agendaUrl(back: string, error?: string): string {
  const carried = new URLSearchParams(back);
  const params = new URLSearchParams();
  for (const key of CARRIED) {
    const value = carried.get(key);
    if (value) params.set(key, value);
  }
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

/**
 * Runs one call, then puts the provider back where they were reading.
 *
 * <p>Every one of these can be refused for a reason the provider can act on -
 * the chair is taken, the appointment has moved on, the colleague has no hours
 * that day. An uncaught ApiError renders the 500 page, which tells them the
 * product is broken when what happened is that the answer was no.
 *
 * <p>The redirect happens on success too, and not only to drop a stale
 * `?error=` off the URL: an action submitted from Saturday's page must come
 * back to Saturday, not to the default view of the days ahead.
 */
async function attempt(formData: FormData, work: () => Promise<unknown>): Promise<void> {
  const back = String(formData.get("back") ?? "");
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(agendaUrl(back, error.code ?? "UNKNOWN"));
    }
    throw error;
  }
  revalidatePath("/dashboard");
  redirect(agendaUrl(back));
}

/** POST /v1/appointments/{id}/{capability} - nothing to send but the wish. */
async function move(formData: FormData, capability: string): Promise<void> {
  const id = String(formData.get("id"));
  await attempt(formData, () =>
    api(`/v1/appointments/${encodeURIComponent(id)}/${capability}`, { method: "POST" }),
  );
}

export async function confirm(formData: FormData): Promise<void> {
  await move(formData, "confirmation");
}

export async function complete(formData: FormData): Promise<void> {
  await move(formData, "completion");
}

export async function markNoShow(formData: FormData): Promise<void> {
  await move(formData, "no-show");
}

/**
 * Cancelling, with the reason the provider wants recorded.
 *
 * <p>The reason is private to them: the contract says it appears in no message
 * the customer receives, which is why the box can be blunt.
 */
export async function cancel(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim();
  await attempt(formData, () =>
    api(`/v1/appointments/${encodeURIComponent(id)}/cancellation`, {
      method: "POST",
      body: { ...(reason ? { reason } : {}) },
    }),
  );
}

/**
 * Move it, or hand it to somebody else, or both.
 *
 * <p>One operation for the two because the API has one: the exclusion
 * constraint keys on the staff member, so a change of chair is arbitrated as a
 * booking on the new one and releases the old in the same statement. The
 * mockup could only move an appointment in time, and a salon reassigns work
 * all day.
 *
 * <p>`staff_id` is omitted rather than sent null when it has not changed - the
 * contract is explicit that null is not the way to say "leave it".
 */
export async function reschedule(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const staffId = String(formData.get("staff_id") ?? "").trim();
  const startsAt = await instantOf(String(formData.get("starts_at")));

  await attempt(formData, () =>
    api(`/v1/appointments/${encodeURIComponent(id)}/reschedule`, {
      method: "POST",
      body: { starts_at: startsAt, ...(staffId ? { staff_id: staffId } : {}) },
    }),
  );
}

/**
 * The counter: somebody is standing here and the appointment has to be recorded.
 *
 * <p>It goes to /v1/appointments rather than to the public booking path, and
 * that is the whole difference: the published hours and the notice period do
 * not apply to the salon writing in its own book. The one rule that still does
 * is that two people cannot hold one chair, and a 409 says so.
 */
export async function bookWalkIn(formData: FormData): Promise<void> {
  const startsAt = await instantOf(String(formData.get("starts_at")));
  const note = String(formData.get("customer_note") ?? "").trim();

  await attempt(formData, () =>
    api("/v1/appointments", {
      method: "POST",
      // Minted here, once per submission. A key made in the browser would be
      // made again by a reload, which is the case it exists for.
      idempotencyKey: randomUUID(),
      body: {
        service_offering_id: String(formData.get("service_offering_id")),
        staff_id: String(formData.get("staff_id")),
        starts_at: startsAt,
        customer: {
          full_name: String(formData.get("full_name")).trim(),
          phone: String(formData.get("phone")).trim(),
        },
        ...(note ? { customer_note: note } : {}),
      },
    }),
  );
}

/**
 * A datetime-local reading, in the salon's own zone.
 *
 * <p>The zone is read from the API rather than taken from a hidden field or
 * from this process. A hidden field would be a client deciding what its own
 * wall clock means, and `new Date("2026-09-07T10:00")` means ten o'clock where
 * the SERVER is - so a salon in Conakry on a node in Paris would book every
 * walk-in an hour out, with nothing to show for it.
 */
async function instantOf(local: string): Promise<string> {
  const provider = await api<ProviderProfile>("/v1/provider-profile");
  return instantFromLocal(local, provider.timezone);
}
