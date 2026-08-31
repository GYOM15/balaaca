import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ActionButton, Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Retrouver ma réservation",
  description:
    "Ouvrez votre rendez-vous avec la référence reçue au moment de la réservation.",
};

/**
 * The shape the contract publishes for a reference: 20 to 64 characters of
 * URL-safe alphabet. Checked here so a typo comes back as a sentence instead
 * of a 404 - and checked ONLY for shape, because whether a well-formed
 * reference names anything is not this page's business to reveal.
 */
const REFERENCE = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * The way back in, for somebody who has their reference and nothing else.
 *
 * <p>There is no account to sign into and there never will be: a customer
 * books in ninety seconds without one, and the reference is what that trade
 * costs. This page exists because a reference on its own is useless if the
 * only door it opens is a link somebody has already lost.
 *
 * <p>A GET form, so the submission is a URL. No server action and no write:
 * this reads nothing and decides nothing - it hands the reference to the page
 * that owns it, which is the only place the API is called.
 */
export default async function FindBooking({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const query = await searchParams;
  const typed = normalise(query.reference ?? "");

  if (typed && REFERENCE.test(typed)) redirect(`/bookings/${encodeURIComponent(typed)}`);
  const invalid = typed.length > 0;

  return (
    <div className="site">
      <SiteHeader />

      <main className="container container--booking section stack stack-8" id="contenu">
        <div className="stack stack-2">
          <h1 className="t-h2">Retrouver ma réservation</h1>
          <p className="t-body-lg t-muted" style={{ fontWeight: 400 }}>
            Votre référence vous a été donnée au moment de la réservation. Elle
            ouvre votre rendez-vous : vous y voyez l’heure, et vous pouvez
            l’annuler tant que le délai du professionnel le permet.
          </p>
        </div>

        <form className="stack stack-5" method="get" action="/bookings">
          <div className={invalid ? "field field--invalid" : "field"}>
            <label className="field__label" htmlFor="reference">
              Référence
              <span className="field__req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              className="input tnum"
              id="reference"
              name="reference"
              type="text"
              required
              defaultValue={query.reference ?? ""}
              // Un téléphone met une majuscule et corrige tout seul, ce qui
              // suffit à casser une référence qui distingue la casse.
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              placeholder="Collez-la ici"
              aria-describedby={invalid ? "reference-error" : "reference-hint"}
              aria-invalid={invalid ? "true" : undefined}
            />
            {invalid ? (
              <p className="field__error" id="reference-error">
                <Icon name="alert-circle" size={15} />
                <span>
                  Cette référence n’a pas la bonne forme. Vérifiez qu’elle est
                  complète, sans espace ni caractère en trop.
                </span>
              </p>
            ) : (
              <p className="field__hint" id="reference-hint">
                Vous pouvez aussi coller le lien complet de votre rendez-vous :
                la référence y est.
              </p>
            )}
          </div>

          <ActionButton
            label="Ouvrir ma réservation"
            variant="primary"
            size="lg"
            type="submit"
            iconEnd="arrow-right"
          />
        </form>

        <Notice tone="neutral" icon="help" title="Vous n’avez plus votre référence ?">
          Elle est dans le message de confirmation, et dans l’adresse de la page
          que vous avez ouverte après avoir réservé. Sans elle, appelez le
          professionnel : le rendez-vous est dans son agenda, et lui peut le
          retrouver à votre nom.
        </Notice>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * What somebody actually pastes, reduced to the reference itself.
 *
 * <p>People paste the whole link, because the link is what the confirmation
 * message contains. Taking the last path segment costs one line and saves the
 * person who did the obvious thing from being told they did it wrong. The case
 * is left alone: the alphabet is case-sensitive, so upper-casing a reference
 * would break it rather than tidy it.
 */
function normalise(value: string): string {
  const trimmed = value.trim();
  const path = trimmed.split(/[?#]/)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  return segments.length > 1 ? (segments[segments.length - 1] ?? "") : trimmed;
}
