/* Balaaca service worker.
 *
 * It exists so a telephone will offer to install this, and it is deliberately
 * the smallest thing that does. What it does NOT cache is the point.
 *
 * A provider's dashboard is a diary. Serving a cached agenda would show
 * yesterday's appointments to somebody standing in front of a customer, and
 * they would have no way to know the screen was lying. An error says "no
 * network"; a stale page says nothing at all. So no page of this application
 * is ever stored, and nothing under /api is ever read from a cache.
 *
 * Two things are cached, and neither can go stale:
 *   - /hors-ligne, one fixed sentence, so an installed window answers something
 *     when the network does not. Without it a standalone window with no browser
 *     chrome shows the browser's own error page, which on Android is a dinosaur
 *     with no way back.
 *   - build output under /_next/static, whose filenames carry a content hash,
 *     so a hit can never be the wrong version. This is what keeps the offline
 *     page legible: its stylesheet is one of those files.
 */

const VERSION = "v1";
const SHELL = `balaaca-shell-${VERSION}`;
const STATIC = `balaaca-static-${VERSION}`;
const OFFLINE = "/hors-ligne";

/*
 * How many hashed files to keep.
 *
 * <p>This is here because a content-hashed cache has no natural end. Every
 * deployment mints new filenames, the old ones match nothing and are never
 * evicted, and the worker's own VERSION does not move - so without a bound the
 * cache grows by a build's worth of JavaScript every time we ship, on a
 * telephone, forever. Bumping VERSION by hand on each deploy would be one more
 * pair of things that must agree with nothing checking that they do.
 *
 * <p>Sixty is roughly two builds of this application's chunks, so the previous
 * deployment survives long enough to serve anyone mid-session and the one
 * before it does not. `cache.keys()` returns insertion order, so the oldest
 * entry is the first one.
 */
const KEEP = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Every cache this origin holds that is not one of the two current names
  // goes. A worker that accumulates caches across deployments is how a phone
  // ends up serving a build nobody remembers shipping.
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("balaaca-") && name !== SHELL && name !== STATIC)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Drop the oldest entries once the cache is over its bound. */
async function trim(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, keys.length - KEEP)) {
    await cache.delete(request);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only GET. A POST is a booking, a cancellation, a profile being saved:
  // replaying one from a cache would repeat an action somebody took once.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never the API, and never a media file: a provider who replaces their cover
  // must see the new one, and the URL does not change when they do.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;

  // Build output only. Content-hashed, so a hit can never be the wrong version.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const answer = await fetch(request);
        if (answer.ok) {
          await cache.put(request, answer.clone());
          await trim(cache);
        }
        return answer;
      }),
    );
    return;
  }

  // Everything else is a page. Network first, always, and the stored sentence
  // only when the network genuinely fails. Nothing is written to a cache here:
  // a page of this application is a page about somebody's day.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE).then((hit) => hit ?? Response.error()),
      ),
    );
  }
});
