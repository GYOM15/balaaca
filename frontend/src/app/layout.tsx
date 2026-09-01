import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Presentation } from "@/components/presentation";
import { Sprite } from "@/components/sprite";
import "./globals.css";

/**
 * Self-hosted, not linked.
 *
 * <p>The mockup pulled Manrope from fonts.googleapis.com in a render-blocking
 * <link>. next/font downloads the face at build time and serves it from this
 * origin, so the first paint waits on nothing a third party controls - which
 * matters more on a phone in Conakry than anywhere this was designed.
 *
 * <p>display: swap, so the page is readable in the fallback while the face
 * arrives rather than blank.
 */
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  // The mark, as the tab and a phone's home screen show it. The round tile of
  // the brand sheet rather than the square one: at 32 px a rounded square and
  // a circle are one pixel apart, and the circle survives the crop every
  // platform applies without asking.
  icons: {
    icon: [{ url: "/brand/favicon-512.png", type: "image/png", sizes: "512x512" }],
    apple: "/brand/favicon-512.png",
  },
  title: {
    default: "Balaaca — trouver un professionnel",
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={manrope.variable}>
      <body>
        {/* Once, at the root: every `use` after this is a reference rather
            than another parse, which is what makes an icon free on the
            telephones this is built for. */}
        <Sprite />
        <a className="skip-link" href="#contenu">
          Aller au contenu
        </a>
        {children}
        {/* Animation, copying, previews and toasts - nothing that reads a
            value. The session never leaves the server. */}
        <Presentation />
      </body>
    </html>
  );
}
