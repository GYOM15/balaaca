import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { exchange } from "@/lib/oidc";
import { PKCE_COOKIE, writeSealed } from "@/lib/session";

type Started = { verifier: string; state: string; next: string };

/**
 * Finishes the sign-in.
 *
 * <p>The code is exchanged here, with the client secret, and the tokens go
 * straight into the sealed cookie. Nothing is returned to the browser but a
 * redirect - the browser never sees a token, which is the entire reason this
 * client is confidential and this route exists.
 *
 * <p>Both cookies are written on the response being returned. Doing it through
 * the ambient store while returning a redirect built here is what produced a
 * sign-in loop: the redirect went out, the Set-Cookie did not, the next request
 * had no session, and it started again.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const started = read(request.cookies.get(PKCE_COOKIE)?.value);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  // Every one of these is "this is not a sign-in this browser started". They
  // are one answer on purpose: telling them apart would say which half an
  // attacker got right.
  if (!started || !code || !state || state !== started.state) {
    return failed();
  }

  let session;
  try {
    session = await exchange(code, started.verifier);
  } catch {
    return failed();
  }

  const response = NextResponse.redirect(new URL(started.next, env.publicOrigin));
  // In numbered pieces: a signed-in provider's tokens exceed what a browser
  // will hold in one cookie, and a cookie that is too big is dropped silently.
  writeSealed(response.cookies, session);
  response.cookies.delete(PKCE_COOKIE);
  return response;
}

function failed(): NextResponse {
  const response = NextResponse.redirect(new URL("/?signin=failed", env.publicOrigin));
  response.cookies.delete(PKCE_COOKIE);
  return response;
}

function read(value: string | undefined): Started | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const s = parsed as Record<string, unknown>;
    return typeof s.verifier === "string" &&
      typeof s.state === "string" &&
      typeof s.next === "string"
      ? { verifier: s.verifier, state: s.state, next: s.next }
      : null;
  } catch {
    return null;
  }
}
