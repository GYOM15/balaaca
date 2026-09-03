import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, pkce } from "@/lib/oidc";
import { PKCE_COOKIE, cookieOptions } from "@/lib/session";

/**
 * Starts the sign-in.
 *
 * <p>The verifier and the state are put in a short cookie rather than in the
 * URL, because the callback has to prove it is the same browser that started
 * this. Without that, an attacker's authorization code could be planted on
 * somebody else's session - they would end up signed in as the attacker,
 * looking at what they believed was their own salon.
 *
 * <p>Set on the response this handler returns, not through the ambient cookie
 * store. A handler that builds its own NextResponse and then writes cookies
 * elsewhere is relying on the two being merged, and when they are not the
 * failure is a sign-in loop with nothing in the log that says why.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { verifier, challenge } = pkce();
  const state = randomBytes(16).toString("base64url");

  // Where to land afterwards, kept beside the verifier rather than in the URL:
  // a redirect target a caller can write is an open redirect.
  const requested = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const next =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  const response = NextResponse.redirect(await authorizeUrl(challenge, state));
  response.cookies.set(PKCE_COOKIE, JSON.stringify({ verifier, state, next }), {
    ...cookieOptions(),
    // Long enough to sign in, short enough that an abandoned attempt is gone.
    maxAge: 600,
  });
  return response;
}
