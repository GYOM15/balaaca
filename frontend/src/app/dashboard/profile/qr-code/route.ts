import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { readSession } from "@/lib/session";

/**
 * The QR code, served through this server.
 *
 * <p>Same reason as the images: the browser only ever talks to this server, and
 * in production the API sits on a container network it cannot reach at all. So
 * `<img src="/v1/provider-profile/qr-code">` would resolve against this origin
 * and 404. It is proxied here instead.
 *
 * <p>One difference from the media route, and it decides the shape of this
 * file: the code belongs to one business, so the call has to be made as
 * somebody. `api()` cannot do it - it parses JSON, and this answers SVG - so the
 * token is attached by hand. The proxy matcher already covers `/dashboard`,
 * which is what makes the session read here a live one.
 */
export async function GET(): Promise<NextResponse> {
  const session = await readSession();
  if (!session) {
    return new NextResponse(null, { status: 401 });
  }

  const upstream = await fetch(new URL("/v1/provider-profile/qr-code", env.apiBaseUrl), {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "image/svg+xml",
    },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    // A refusal is an answer about this session, not a broken upstream, and
    // calling it 502 would send somebody looking at the API.
    const refused = upstream.status === 401 || upstream.status === 403;
    return new NextResponse(null, { status: refused ? upstream.status : 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/svg+xml",
      // Private, and only a day. It encodes the public URL, which is built from
      // the slug and cannot change - but it is one business's square, so a
      // shared cache must never hand it to the next provider who asks.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
