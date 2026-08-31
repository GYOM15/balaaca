"use server";

import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type { JoinedProvider } from "@/lib/types";

/**
 * Redeeming an invitation.
 *
 * <p>Authenticated and tenant-free, like registration and for the same reason:
 * the caller has no membership, and this is what gives them one. It asks for
 * no scope, because a scope says what somebody may do inside their own
 * provider and they do not have one yet.
 */
export async function join(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();

  try {
    await api<JoinedProvider>(`/v1/invitations/${encodeURIComponent(code)}/acceptance`, {
      method: "POST",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // A session that aged out between the render and the submit is not a bad
      // code, and saying so would send somebody hunting for a working
      // invitation they already hold.
      if (error.status === 401) redirect("/api/auth/login?next=/rejoindre");

      redirect(outcome(error.code));
    }
    throw error;
  }

  redirect("/dashboard");
}

/**
 * Two answers, and never more.
 *
 * <p>`CODE` is everything the code itself can be wrong about, deliberately
 * fused. The server refuses to say whether an unknown code, an expired one,
 * one already spent and one belonging to a suspended business are different
 * situations - it answers the same 404 to all four - and a client that split
 * them apart again would rebuild exactly the oracle that closed: try codes,
 * read which sentence comes back, learn which ones ever existed. So even the
 * query string says only that it failed.
 *
 * <p>The code is not carried back either. It is a bearer secret for the seven
 * days it lives; putting it in an address bar would leave it in browser
 * history and in every referer sent from this page.
 *
 * <p>`MEMBER` is the one refusal kept apart, and it is not about the code. It
 * says this account already belongs somewhere, which the person can see for
 * themselves by opening their dashboard - it reveals nothing to a guesser that
 * a guesser does not already know about their own account. Folding it into the
 * code message would cost a real employee their afternoon: they would keep
 * asking the owner for a new code to fix a situation no code can fix.
 */
function outcome(code: string | null): string {
  return code === "ALREADY_REGISTERED" ? "/rejoindre?error=MEMBER" : "/rejoindre?error=CODE";
}
