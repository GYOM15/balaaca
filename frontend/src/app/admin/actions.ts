"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";

/**
 * The four things the operator can do, each one an operation the API publishes
 * rather than a field this form sets.
 *
 * <p>Looking and acting are separate on purpose and stay separate here. A
 * report can be entirely real and still not warrant taking a salon off the hub,
 * and a contestation can be read and refused - so nothing in this file marks
 * something seen as a side effect of the lever, or pulls the lever as a side
 * effect of looking.
 */

/**
 * The queue the operator was reading when they submitted.
 *
 * <p>Copied key by key rather than passed through: `back` is a hidden field, so
 * it is whatever the browser sent, and rebuilding from a known list means a
 * crafted value can add nothing to the URL a person lands on.
 */
const CARRIED = ["queue", "status", "cursor"] as const;

function queueUrl(back: string, error?: string): string {
  const carried = new URLSearchParams(back);
  const params = new URLSearchParams();
  for (const key of CARRIED) {
    const value = carried.get(key);
    if (value) params.set(key, value);
  }
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

/**
 * Runs one call, then puts the operator back where they were reading.
 *
 * <p>Every one of these can be refused for a reason the operator can act on -
 * the salon is already in the state asked for, the motive is too short, the
 * account lost its scope. An uncaught ApiError renders the 500 page, which at
 * eleven at night says the console is broken when the answer was no.
 *
 * <p>The redirect happens on success too, so a refusal from a previous attempt
 * does not stay in the URL above a save that worked.
 */
async function attempt(formData: FormData, work: () => Promise<unknown>): Promise<void> {
  const back = String(formData.get("back") ?? "");
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(queueUrl(back, error.code ?? "UNKNOWN"));
    }
    throw error;
  }
  revalidatePath("/admin");
  redirect(queueUrl(back));
}

/**
 * Records that somebody looked.
 *
 * <p>Nothing else. It says nothing about whether the business was punished,
 * which is why the button beside it is a separate button.
 */
export async function reviewReport(formData: FormData): Promise<void> {
  const id = String(formData.get("report_id"));
  await attempt(formData, () =>
    api(`/v1/admin/reports/${encodeURIComponent(id)}/review`, { method: "POST" }),
  );
}

/**
 * Records that somebody read what a business wrote back.
 *
 * <p>Nothing else, again. It does not lift the suspension, it does not answer
 * the business, and the business is told nothing by it - the platform simply
 * has a trace that somebody read it. Reinstating is the button beside it, and
 * it is a different decision with its own audit row.
 */
export async function markContestationRead(formData: FormData): Promise<void> {
  const id = String(formData.get("contestation_id"));
  await attempt(formData, () =>
    api(`/v1/admin/contestations/${encodeURIComponent(id)}/reading`, { method: "POST" }),
  );
}

/**
 * Takes a business off the hub.
 *
 * <p>The motive is sent as typed and is never carried back on a refusal. It
 * names a business and accuses it, and a redirect puts what it carries in the
 * address bar, in the browser's history and in every access log on the way -
 * so a rejected suspension costs the operator a retype rather than leaking the
 * accusation into places nobody meant to write it.
 */
export async function suspendProvider(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug"));
  const reason = String(formData.get("reason") ?? "").trim();
  await attempt(formData, () =>
    api(`/v1/admin/providers/${encodeURIComponent(slug)}/suspension`, {
      method: "POST",
      body: { reason },
    }),
  );
}

/**
 * Puts it back.
 *
 * <p>No motive, because there is nothing to record on the provider's own row:
 * the reinstatement clears it there and the audit trail keeps both decisions.
 */
export async function reinstateProvider(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug"));
  await attempt(formData, () =>
    api(`/v1/admin/providers/${encodeURIComponent(slug)}/suspension`, { method: "DELETE" }),
  );
}
