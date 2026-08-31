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
 * Runs one call and turns a refusal into a message rather than a crash.
 *
 * <p>Every one of these can be refused for a reason the provider can act on -
 * the chair is taken, the appointment has moved on, the colleague has no hours
 * that day. An uncaught ApiError renders the 500 page, which tells them the
 * product is broken when what happened is that the answer was no.
 */
async function attempt(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard");
}

async function move(id: string, capability: string): Promise<void> {
  await attempt(() =>
    api(`/v1/appointments/${encodeURIComponent(id)}/${capability}`, { method: "POST" }),
  );
}

export async function confirm(formData: FormData): Promise<void> {
  await move(String(formData.get("id")), "confirmation");
}

export async function complete(formData: FormData): Promise<void> {
  await move(String(formData.get("id")), "completion");
}

export async function markNoShow(formData: FormData): Promise<void> {
  await move(String(formData.get("id")), "no-show");
}

export async function cancel(formData: FormData): Promise<void> {
  await attempt(() =>
    api(`/v1/appointments/${encodeURIComponent(String(formData.get("id")))}/cancellation`, {
      method: "POST",
      body: { reason: String(formData.get("reason") ?? "") || undefined },
    }),
  );
}

/**
 * Move it, or hand it to somebody else, or both.
 *
 * <p>One operation for the two because the API has one: the exclusion
 * constraint keys on the staff member, so a change of chair is arbitrated as a
 * booking on the new one and releases the old in the same statement.
 */
export async function reschedule(formData: FormData): Promise<void> {
  const staffId = String(formData.get("staff_id") ?? "");
  const startsAt = await instantOf(String(formData.get("starts_at")));

  await attempt(() =>
    api(`/v1/appointments/${encodeURIComponent(String(formData.get("id")))}/reschedule`, {
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

  await attempt(() =>
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
          full_name: String(formData.get("full_name")),
          phone: String(formData.get("phone")),
        },
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
