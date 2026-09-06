"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";

const HERE = "/dashboard/avis";

/**
 * A business answering a review of itself.
 *
 * <p>The only write this product allows a provider on that table, and what
 * confines it is not this action: the database role holds `UPDATE` on the reply
 * and its date and on no other column, so a request that tried to carry a
 * rating would be refused by PostgreSQL before any handler saw it. That is why
 * the reply can be offered at all.
 *
 * <p>Sending it again replaces it. These are the business's own words on its
 * own page, and a public typo it cannot fix is worse than the branch it costs.
 */
export async function replyToReview(formData: FormData): Promise<void> {
  const id = String(formData.get("review_id"));
  const reply = String(formData.get("reply") ?? "").trim();

  // Withdrawing is the DELETE, and an emptied box means exactly that. Sending a
  // blank string instead would be refused by a CHECK constraint, which is the
  // right refusal for the wrong request.
  if (!reply) {
    await withdraw(id);
    return;
  }

  await attempt(() =>
    api(`/v1/reviews/${encodeURIComponent(id)}/reply`, { method: "POST", body: { reply } }),
  );
}

export async function withdrawReviewReply(formData: FormData): Promise<void> {
  await withdraw(String(formData.get("review_id")));
}

async function withdraw(id: string): Promise<void> {
  await attempt(() =>
    api(`/v1/reviews/${encodeURIComponent(id)}/reply`, { method: "DELETE" }),
  );
}

/**
 * A refusal is an answer, not a fault.
 *
 * <p>`INVALID_STATE_TRANSITION` means an operator took the review down while
 * this page was open, which is real and belongs on the page as a sentence -
 * not on the 500 screen, which says the product is broken when the product
 * simply said no.
 */
async function attempt(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`${HERE}?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath(HERE);
  redirect(`${HERE}?saved=1`);
}
