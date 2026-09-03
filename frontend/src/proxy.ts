import { NextResponse, type NextRequest } from "next/server";
import { clearSealed, readSealed, writeSealed } from "@/lib/session";
import { refresh } from "@/lib/oidc";

/**
 * The one place a session is checked and renewed.
 *
 * <p>It runs before anything renders, and that is not an optimisation - it is
 * the only place this can happen. A page render may READ cookies and may not
 * WRITE them: Next refuses, by design, because the response has already begun.
 * So refreshing an expired token inside {@code api()} threw on the write, and
 * the whole dashboard answered 500 the first time an access token aged out -
 * about an hour after signing in, for everybody, every time.
 *
 * <p>Here the response has not been sent, so the renewed cookie goes out with
 * it and every render downstream sees a token that is good for this request.
 *
 * <p>Proxy always runs on the Node runtime, which is what lets it open the
 * sealed cookie at all: it is AES-256-GCM through node:crypto, and none of that
 * exists on the edge.
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const session = readSealed(request.cookies);
  if (!session) return signIn(request);

  // Still good. The margin is already inside expiresAt, so a token valid here
  // is valid when the API validates it a few hundred milliseconds later.
  if (session.expiresAt > Math.floor(Date.now() / 1000)) {
    return NextResponse.next();
  }

  try {
    const renewed = await refresh(session);
    const response = NextResponse.next();
    writeSealed(response.cookies, renewed);
    return response;
  } catch {
    // The realm revoked it, or it simply aged out. Either way this is not a
    // session any more, and looping through failing calls would tell the
    // person their dashboard is broken rather than that they are signed out.
    const response = signIn(request);
    clearSealed(response.cookies);
    return response;
  }
}

function signIn(request: NextRequest): NextResponse {
  const login = new URL("/api/auth/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Every path that speaks to the API as somebody. Everything else on this
  // site is a customer's, and a customer has no account - matching more would
  // put a sign-in in front of the search box.
  matcher: ["/dashboard/:path*", "/inscription", "/rejoindre"],
};
