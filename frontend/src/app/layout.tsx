import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Balaaca",
  description: "Prendre rendez-vous chez les professionnels de Guinee.",
};

/**
 * The shell. French, because that is what a customer in Conakry reads - the
 * repository is English and the product is not.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
