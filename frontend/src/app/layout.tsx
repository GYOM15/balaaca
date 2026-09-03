import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import { Suspense } from "react";
import { Presentation } from "@/components/presentation";
import { Sprite } from "@/components/sprite";
import { Toasts } from "@/components/toasts";
import "./globals.css";

/**
 * Two families, and the split is the point.
 *
 * <p>Clash Display carries the identity: the headings, the hero, the marketing
 * sections, the figures. DM Sans carries the work: navigation, running text,
 * forms, tables, the dashboard. A single family doing both ends up either too
 * plain where the brand should speak or too mannered where a provider is
 * reading a price.
 *
 * <p>Self-hosted, not linked. next/font downloads at build time and serves from
 * this origin, so the first paint waits on nothing a third party controls,
 * which matters more on a telephone in Conakry than anywhere this was designed.
 * display: swap, so the page is readable in the fallback rather than blank.
 *
 * <p>Clash is next/font/local and not next/font/google because it is not on
 * Google Fonts at all: it is Indian Type Foundry's, served by Fontshare, and
 * the four weights live in src/app/fonts. Replacing them is dropping four
 * files; nothing here names a version.
 */
const clash = localFont({
  src: [
    { path: "./fonts/ClashDisplay-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ClashDisplay-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ClashDisplay-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ClashDisplay-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display-face",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-face",
  display: "swap",
});

export const metadata: Metadata = {
  // The mark, as the tab and a phone's home screen show it. The round tile of
  // the brand sheet rather than the square one: at 32 px a rounded square and
  // a circle are one pixel apart, and the circle survives the crop every
  // platform applies without asking.
  //
  // These are the declarations, and app/favicon.ico is the other half of the
  // answer: a browser asks the origin for /favicon.ico whatever the page
  // declares, and caches what it gets per origin. That path answered 404, so
  // the tab kept whatever it had - which is why the wrong mark appeared on
  // some pages and not others. Next serves the file convention there and puts
  // it at the head of this list; do not delete one thinking the other covers
  // it.
  icons: {
    icon: [{ url: "/brand/favicon-512.png", type: "image/png", sizes: "512x512" }],
    apple: "/brand/favicon-512.png",
  },
  title: {
    default: "Balaaca, trouver un professionnel",
    // Every page says what it is; the tab of a provider's page must read the
    // salon's name, not "Balaaca". A link shared on WhatsApp is often the
    // first thing anyone sees of this product.
    template: "%s · Balaaca",
  },
  description:
    "Trouvez un professionnel près de chez vous et réservez votre créneau en ligne.",
};

export const viewport: Viewport = {
  themeColor: "#123C35",
  // viewport-fit=cover: the bottom navigation of the dashboard sits on the
  // home indicator otherwise.
  viewportFit: "cover",
  // The mockup's first declaration, before a single token: `:root {
  // color-scheme: light }`. The palette is one warm light theme and nothing in
  // it answers to prefers-color-scheme, so a phone in dark mode would repaint
  // the form controls, the scrollbars and the <dialog> backdrop dark against
  // it. Said as the meta tag rather than as a CSS rule, because globals.css is
  // byte-identical to the design source and stays that way.
  colorScheme: "light",
};

/**
 * data-scroll-behavior is not decoration, and it is the fix for a defect the
 * owner reported as "ça scrolle automatiquement jusqu'en bas".
 *
 * <p>globals.css sets `html { scroll-behavior: smooth }`. Since Next 15.2 the
 * router only suspends that during a route transition when this attribute says
 * so. Without it, every client navigation started a smooth ANIMATION towards
 * the top, re-measured a document that had not moved yet, concluded the target
 * was still off screen, and fired a second scrollIntoView on top of the first -
 * so the reader watched the whole page travel rather than arriving at the top
 * of it. Next warns about exactly this in development.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${clash.variable} ${dmSans.variable}`} data-scroll-behavior="smooth">
      <body>
        {/* Once, at the root: every `use` after this is a reference rather
            than another parse, which is what makes an icon free on the
            telephones this is built for. */}
        <Sprite />
        {/* Every screen of the mockup was a `section.route` that its hash
            router showed and hid, and the design system keys the opening
            sequence off exactly that: `.js .route:not([hidden]) [data-enter]`.
            Next shows one screen at a time and needs no router, but the class
            still has to be on the element that holds the screen, or every
            data-enter in the product is inert. The only rule that reads
            `.route` otherwise hides one carrying `hidden`, which nothing here
            ever sets, so the class costs nothing else.

            `anim-fade` is in the server's markup rather than added at
            hydration: the fade starts with the first paint instead of blanking
            a page the reader can already see. Presentation retriggers it on
            every later navigation, the way the mockup's router did on every
            hash change. */}
        <div className="route anim-fade">
          <a className="skip-link" href="#contenu">
            Aller au contenu
          </a>
          {children}
        </div>
        {/* Animation, copying, previews and toasts - nothing that reads a
            value. The session never leaves the server.

            Suspended because it reads the query string to know a screen has
            changed, and useSearchParams outside a boundary would opt every
            statically rendered page into dynamic rendering. It draws nothing,
            so the fallback is nothing. */}
        <Suspense fallback={null}>
          <Presentation />
          {/* After Presentation and not before it: a toast is drawn by the
              island Presentation boots, and effects run in mount order, so
              this one is raised into an island that already exists.

              Outside `.route`, because the region is position: fixed and the
              route carries an animation - and because it is one region for the
              whole product, mounted here once, never per screen. */}
          <Toasts />
        </Suspense>
      </body>
    </html>
  );
}
