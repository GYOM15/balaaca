import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/api";
import { Icon } from "@/components/icon";
import { Button, Notice, Wordmark } from "@/components/ui";
import { join } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Rejoindre une équipe" };

type Search = { error?: string; code?: string };

/**
 * Rejoindre une équipe.
 *
 * <p>The other way onto this platform, and the one nobody arrives at by
 * browsing: an owner created a chair in their team, the server issued a code
 * for it, and the owner passed it on by whatever means they already use to
 * reach their own employee. Nothing is sent by this platform, so this page is
 * where that string turns into a membership.
 *
 * <p>One box. There is nothing else to ask - the display name is the one the
 * owner gave the chair, not one the person chooses, because they were invited
 * to a seat that already existed.
 */
export default async function Join({ searchParams }: { searchParams: Promise<Search> }) {
  // The proxy already covers this path. Kept anyway: its matcher is a list one
  // edit away from being wrong, and the cost here is a form whose every
  // submission answers 401 to somebody who was never asked to sign in.
  if (!(await isSignedIn())) redirect("/api/auth/login?next=/rejoindre");

  const query = await searchParams;

  // Prefilled only from a link an owner sent. A code that has just been
  // refused is never handed back this way - see the note in actions.ts.
  const offered = query.code?.trim() ?? "";

  const refused = Boolean(query.error) && query.error !== "MEMBER";

  return (
    <>
      <header className="hdr">
        <div className="page hdr__in">
          <Wordmark size={34} />
          <div className="hdr__actions">
            <Link className="hdr__link" href="/">
              Retour à l’accueil
            </Link>
            <span className="t-xs" style={{ display: "none" }} data-show-md="">
              Besoin d’aide&nbsp;?{" "}
              <Link
                className="link"
                href="/professionnels/comment-ca-marche"
                style={{ marginLeft: ".25rem" }}
              >
                Comment ça marche
              </Link>
            </span>
          </div>
        </div>
      </header>

      {/* The id the root layout's skip link points at. */}
      <main id="contenu">
        <div
          className="page page--narrow"
          style={{ paddingBlock: "var(--s-10) var(--s-16)" }}
        >
          <p className="t-overline">Rejoindre une équipe</p>
          <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
            Vous avez reçu un code d’invitation
          </h1>
          <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
            Il vous a été transmis par le propriétaire de l’établissement. Une
            fois accepté, vous aurez votre propre agenda dans son espace.
          </p>

          {query.error === "MEMBER" ? (
            <>
              <div style={{ marginTop: "var(--s-6)" }}>
                <Notice tone="warning" title="Ce compte appartient déjà à une activité">
                  Un compte ne peut être rattaché qu’à une seule activité. Ce
                  n’est pas le code qui est en cause&nbsp;: aucun code ne
                  fonctionnera sur ce compte-ci. Si l’invitation était pour
                  vous, il vous faut un compte que vous n’avez pas encore
                  utilisé ailleurs.
                </Notice>
              </div>
              <div className="row row--wrap" style={{ marginTop: "var(--s-4)" }}>
                <Button
                  label="Accéder à mon espace"
                  variant="secondary"
                  size="sm"
                  href="/dashboard"
                  iconEnd="arrow-right"
                />
              </div>
            </>
          ) : null}

          {/* Everything the code can be wrong about arrives here, as one
              sentence. It says what to DO - ask for another one - because the
              person cannot tell which of the four reasons applies to them, and
              neither can this page. */}
          {refused ? (
            <div style={{ marginTop: "var(--s-6)" }}>
              <Notice tone="danger" title="Ce code ne fonctionne pas">
                Il a peut-être expiré, ou il a déjà servi. Demandez-en un
                nouveau au propriétaire&nbsp;: il peut en émettre un depuis son
                équipe, et le nouveau remplace l’ancien. Vérifiez aussi qu’il a
                été recopié en entier, sans espace au début ni à la fin.
              </Notice>
            </div>
          ) : null}

          <form className="card card--pad" style={{ marginTop: "var(--s-8)" }} action={join}>
            <div className="field">
              <label className="field__label" htmlFor="code">
                Code d’invitation
                <span className="field__req" aria-hidden="true">*</span>
              </label>
              <input
                className="input"
                type="text"
                id="code"
                name="code"
                placeholder="BAL-4K2P-9XQ"
                required
                // The contract's own bounds, to the character: a code is 20 to
                // 64 of [A-Za-z0-9_-]. The browser catches a truncated paste
                // before the round trip; the server checks it again, because a
                // pattern in HTML is a convenience and never a guarantee.
                minLength={20}
                maxLength={64}
                pattern="[A-Za-z0-9_-]+"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                defaultValue={offered}
                style={{
                  textTransform: "uppercase",
                  letterSpacing: ".12em",
                  fontWeight: 700,
                }}
                aria-invalid={refused ? true : undefined}
              />
            </div>

            <div style={{ marginTop: "var(--s-5)" }}>
              {/* Written out rather than taken from `ActionButton`, which emits
                  the idle label alone: this button carries the four states the
                  design system draws, and `globals.css` swaps them on
                  `data-busy` / `data-done`. The design's `data-optimistic` is
                  deliberately not carried - it cancels the click and raises a
                  toast that says "welcome", on a form that really submits. */}
              <button className="btn btn--primary btn--lg btn--block" type="submit">
                <span className="btn__label--idle">Rejoindre l’équipe</span>
                <span className="btn__icon--busy">
                  <Icon name="loader" size={18} className="ico--spin" />
                </span>
                <span className="btn__label--busy">Vérification…</span>
                <span className="btn__icon--done">
                  <Icon name="check" size={18} />
                </span>
                <span className="btn__label--done">Bienvenue</span>
              </button>
            </div>
          </form>

          <div style={{ marginTop: "var(--s-6)" }}>
            <Notice tone="neutral" title="Le code ne fonctionne pas ?">
              Les invitations expirent. Demandez au propriétaire d’en générer
              une nouvelle depuis l’écran Équipe de son espace.
            </Notice>
          </div>
        </div>
      </main>
    </>
  );
}
