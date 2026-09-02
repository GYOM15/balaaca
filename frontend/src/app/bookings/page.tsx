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
 * The shape the contract publishes for a reference: three initials taken from
 * the business name, an optional hyphen, then six symbols of an alphabet with
 * `0`, `O`, `1`, `I` and `L` struck out of it - the characters a person hears
 * wrong and reads wrong down a telephone.
 *
 * <p>Both cases are in it because the API ignores case, and the initials admit
 * `0` and `1` because that is how somebody transcribes the `O` or the `I` they
 * were just told. The six symbols admit no such tolerance and want none: a
 * character heard wrong there has no correct reading.
 *
 * <p>This replaced 43 characters of base64url, which no page could put in a
 * heading without destroying. Checked here so a typo comes back as a sentence
 * instead of a 404 - and checked ONLY for shape, because whether a well-formed
 * reference names anything is not this page's business to reveal.
 */
const REFERENCE = /^[A-Za-z01]{3}-?[2-9A-HJKMNP-Za-hjkmnp-z]{6}$/;

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

  if (typed && REFERENCE.test(typed)) {
    redirect(`/bookings/${encodeURIComponent(canonical(typed))}`);
  }
  // Anything left in the box that was not redirected was refused, which is why
  // this reads the raw parameter rather than the normalised one: a paste of
  // "/" normalises to nothing while still being something the person typed.
  const invalid = (query.reference ?? "").trim().length > 0;

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
                  // Upper case on a phone keyboard, because that is the case a
                  // reference is minted and printed in: the customer is copying
                  // one off a screen and comparing what they typed to it. The
                  // API ignores case either way, so this changes nothing but
                  // whether the two look alike while it is being typed.
                  autoCapitalize="characters"
                  // Autocorrect, on the other hand, would rewrite six random
                  // characters into a word it recognises.
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
                      Cette référence n’a pas la bonne forme. Elle s’écrit en
                      trois lettres, un tiret et six caractères, comme
                      SFA-K7M2QP. Vérifiez qu’elle est complète et sans
                      caractère en trop.
                    </span>
                  </p>
                ) : (
                  <p className="field__hint" id="reference-hint">
                    Trois lettres, un tiret et six caractères, comme SFA-K7M2QP.
                    Majuscules ou minuscules, avec ou sans le tiret : c’est la
                    même référence. Vous pouvez aussi coller le lien complet de
                    votre rendez-vous : la référence y est.
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
 * person who did the obvious thing from being told they did it wrong - and
 * taking it unconditionally is what makes a bare reference with a trailing
 * slash or a query stuck to it work too. It used to be taken only when there
 * was more than one segment, so `SFA-K7M2QP/` and `SFA-K7M2QP?x=1` were handed
 * on whole and refused.
 *
 * <p>Spaces go because a reference dictated over the telephone gets written
 * down in halves, and none is ever part of one. The case is left as typed: it
 * is the raw parameter that fills the box again when the shape is refused, and
 * showing somebody their own typing back is the point of that.
 */
function normalise(value: string): string {
  const path = value.trim().split(/[?#]/)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  return (segments[segments.length - 1] ?? "").replace(/\s+/g, "");
}

/**
 * The reference as the API mints one: `AAA-BBBBBB`, upper case throughout.
 *
 * <p>Accepted more loosely than it is minted - case ignored, hyphen optional -
 * so `sfa-k7m2qp` and `SFAK7M2QP` both resolve. This is what turns either of
 * them into the one form, so the URL a customer lands on and shares is the one
 * printed on their confirmation rather than whichever way they typed it.
 *
 * <p>Safe only on a value the pattern above has already accepted: the six
 * symbols have no lower-case-only members, so upper-casing cannot take a
 * reference out of the alphabet, and nine characters means the hyphen is
 * missing rather than somewhere else.
 */
function canonical(reference: string): string {
  const upper = reference.toUpperCase();
  return upper.includes("-") ? upper : `${upper.slice(0, 3)}-${upper.slice(3)}`;
}

