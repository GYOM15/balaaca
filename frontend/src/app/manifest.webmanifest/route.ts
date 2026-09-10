import type { MetadataRoute } from "next";

/**
 * What a telephone needs before it will offer to install this.
 *
 * <p>For the PROVIDER, not the customer. A customer reaches a business through
 * a link in WhatsApp and books once; asking them to install something first is
 * a wall in front of the one act this product wants to be easy. A provider
 * opens the diary several times a day, and an icon on the home screen is worth
 * something to them.
 *
 * <p>Which is why this is a route handler and not `app/manifest.ts`. The file
 * convention is the idiomatic way to write this, and it puts
 * `<link rel="manifest">` in the head of EVERY page - verified in the build
 * output, on `/conditions` among others. A customer reading a provider's page
 * would then be offered an install whose `start_url` is `/dashboard`: they tap
 * the new icon, land on a sign-in for an account they do not have, and that is
 * the end of it. Served from here, the link is declared by the dashboard layout
 * alone, so only somebody who is already signed in is ever offered the
 * application. If this moves back to the file convention, that link comes back
 * everywhere.
 *
 * <p>`start_url` is the dashboard for the same reason. An installed icon that
 * opened the marketing site would make the person navigate to their own diary
 * every morning.
 *
 * <p>`display: standalone` removes the browser chrome, which is what makes the
 * thing feel installed rather than bookmarked. It also removes the back button,
 * which is why `BackLink` had to exist before this did.
 *
 * <p>Android is the target and the manifest is what Chrome reads. iOS Safari
 * ignores most of this and installs from the share sheet instead; see
 * `InstallPrompt`, which says so rather than showing a button that cannot work.
 */
const MANIFEST: MetadataRoute.Manifest = {
  name: "Balaaca, mon activité",
  short_name: "Balaaca",
  description: "Votre agenda, vos rendez-vous et votre page, depuis votre téléphone.",
  start_url: "/dashboard",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  // The same green the browser chrome already uses, so the splash screen and
  // the status bar do not disagree with the application under them. It has to
  // equal the root layout's viewport themeColor, and pwa.test.mts reads both.
  theme_color: "#123C35",
  // The splash screen, which is painted before a single pixel of the page.
  // It is --p-warm-050, the stylesheet's own --bg, and not the ivory of the
  // share card: those two creams are a shade apart, and the difference shows
  // as a flash every single time the application is opened.
  background_color: "#FAF8F2",
  lang: "fr",
  dir: "ltr",
  categories: ["business", "productivity"],
  icons: [
    // Two files, not one, and the comment here used to claim one was enough.
    //
    // `any` is drawn as given: the circle, which is the mark. `maskable` is
    // CROPPED by the launcher to whatever shape it uses, and only the middle
    // 80 % survives - so it has to be a full-bleed OPAQUE square, or the crop
    // exposes transparency and the launcher paints its own colour through the
    // corners. favicon-512 is 20 % transparent by construction, being a circle
    // in a square, and was declared for both.
    { src: "/brand/favicon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

/** Fixed bytes, so it is generated once at build rather than on every load. */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(JSON.stringify(MANIFEST, null, 2), {
    headers: {
      // The registered type. `application/json` works in Chrome and is refused
      // by nothing, but the specification names this one.
      "content-type": "application/manifest+json",
    },
  });
}
