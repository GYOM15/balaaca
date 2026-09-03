import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * The images, served through this server.
 *
 * <p>The API mints a public URL of the form `/v1/media/<name>.jpg`, and that
 * path is relative on purpose - it is the API's own origin. But the browser
 * never addresses the API here: it talks to this server and nothing else, and
 * in production the API is on a container network the browser cannot reach at
 * all. So the path is rewritten to `/media/<name>` on the way out and proxied
 * back here.
 *
 * <p>The name is minted by the server, carries no meaning and cannot be
 * walked, and this route re-checks its shape anyway: what arrives in a URL
 * segment is whatever a caller typed, and a name that reached the API unchecked
 * would be a path this server had agreed to fetch.
 */
const NAME = /^[A-Za-z0-9_-]{16,64}\.(jpg|png)$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params;
  if (!NAME.test(name)) {
    return new NextResponse(null, { status: 404 });
  }

  const upstream = await fetch(new URL(`/v1/media/${name}`, env.apiBaseUrl), {
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(null, { status: upstream.status === 404 ? 404 : 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      // The name is content-addressed by the server - a new image is a new
      // name - so the bytes behind one never change and a year is honest.
      // This is the one thing in the whole application that is cached.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
