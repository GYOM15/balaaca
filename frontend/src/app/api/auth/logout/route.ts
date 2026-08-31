import { NextResponse } from "next/server";
import { endSessionUrl } from "@/lib/oidc";
import { clearSealed, readSession } from "@/lib/session";

/**
 * Signs out here AND at the realm.
 *
 * <p>Both, and that is the whole of it. Clearing only this cookie leaves
 * Keycloak's own SSO session alive, so the next visit to the dashboard gets a
 * fresh authorization code with no password asked - the person believes they
 * signed out and did not. The id_token_hint is what turns the realm's "do you
 * want to log out?" prompt into an actual logout.
 *
 * <p>The cookie is deleted on the response being returned rather than through
 * the ambient helper: this handler returns a redirect it built itself, and a
 * deletion applied anywhere else would not travel with it.
 *
 * <p>POST, not GET. A sign-out on GET is triggered by any image tag on any page
 * on the internet.
 */
export async function POST(): Promise<NextResponse> {
  const session = await readSession();

  // No session: nothing to end anywhere, and the realm has no hint to act on.
  const destination = session
    ? await endSessionUrl(session.idToken)
    : new URL("/", process.env.APP_PUBLIC_ORIGIN ?? "http://localhost:3000").toString();

  const response = NextResponse.redirect(destination, { status: 303 });
  clearSealed(response.cookies);
  return response;
}
