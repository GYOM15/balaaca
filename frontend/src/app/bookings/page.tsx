import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";

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
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        <section className="section section--lg atmo tex-halo">
          <svg className="wm wm--tr wm--gold" viewBox="0 0 24 24" aria-hidden="true">
            <use href="#i-calendar-check" />
          </svg>
          <div className="page page--narrow">
            <div
              style={{ textAlign: "center", maxWidth: "46ch", marginInline: "auto" }}
              data-enter="1"
            >
              <span className="badge badge--brand">
                <Icon name="calendar-check" /> Sans compte
              </span>
              <h1 className="t-h1" style={{ marginTop: "var(--s-4)" }}>
                Retrouver ma réservation
              </h1>
              <p className="t-lead" style={{ marginTop: "var(--s-3)" }}>
                Saisissez la référence reçue au moment de la réservation.
              </p>
            </div>

            <form
              className="card card--pad"
              method="get"
              action="/bookings"
              style={{ marginTop: "var(--s-8)" }}
            >
              <div className="field">
                <label className="field__label" htmlFor="reference">
                  Référence
                  <span className="field__req" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  className="input"
                  id="reference"
                  name="reference"
                  type="text"
                  required
                  defaultValue={query.reference ?? ""}
                  // A phone capitalises and autocorrects on its own, which is
                  // enough to break a reference that is case-sensitive.
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Collez-la ici"
                  aria-describedby={invalid ? "reference-error" : "reference-hint"}
                  aria-invalid={invalid ? "true" : undefined}
                  style={{ letterSpacing: ".14em", fontWeight: 800, fontSize: "1.15rem" }}
                />
                {invalid ? (
                  <p className="field__error" id="reference-error">
                    <Icon name="alert-circle" size={16} />
                    <span>
                      Cette référence n’a pas la bonne forme. Vérifiez qu’elle est
                      complète, sans espace ni caractère en trop.
                    </span>
                  </p>
                ) : (
                  <p className="field__hint" id="reference-hint">
                    Les majuscules comptent. Vous pouvez aussi coller le lien
                    complet de votre rendez-vous : la référence y est.
                  </p>
                )}
              </div>

              <div style={{ marginTop: "var(--s-5)" }}>
                <button className="btn btn--primary btn--lg btn--block" type="submit">
                  <span className="btn__label--idle">Ouvrir ma réservation</span>
                </button>
              </div>
            </form>

            <div style={{ marginTop: "var(--s-6)" }}>
              <div className="alert alert--neutral" role="status">
                <span className="alert__icon">
                  <Icon name="info" />
                </span>
                <div className="grow">
                  <div className="alert__title">Référence perdue&nbsp;?</div>
                  <div className="alert__body">
                    Le message WhatsApp reçu du prestataire la contient. Sinon,
                    appelez directement l’établissement : il retrouve votre
                    rendez-vous avec votre numéro de téléphone.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <TabBar active={"reservation"} />
    </>
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

