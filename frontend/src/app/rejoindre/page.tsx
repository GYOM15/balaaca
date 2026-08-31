import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/api";
import { Icon } from "@/components/icon";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ActionButton, Button, Notice } from "@/components/ui";
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

  return (
    <div className="site">
      <SiteHeader kind="pro" />

      <main
        className="site__main container container--booking section stack stack-8"
        id="contenu"
      >
        <header className="stack stack-3">
          <h1 className="t-h2">Rejoindre une équipe</h1>
          <p className="t-body t-muted measure" style={{ fontWeight: 400 }}>
            Le propriétaire a créé votre place dans son équipe et vous a
            transmis un code. Entrez-le&nbsp;: il vous rattache à son activité,
            et vous ouvrez le même carnet de rendez-vous que lui.
          </p>
        </header>

        {query.error === "MEMBER" ? (
          <div className="stack stack-3">
            <Notice tone="warning" title="Ce compte appartient déjà à une activité">
              Un compte ne peut être rattaché qu'à une seule activité. Ce n'est
              pas le code qui est en cause&nbsp;: aucun code ne fonctionnera sur
              ce compte-ci. Si l'invitation était pour vous, il vous faut un
              compte que vous n'avez pas encore utilisé ailleurs.
            </Notice>
            <div className="row row-3 row--wrap">
              <Button
                label="Ouvrir mon tableau de bord"
                variant="secondary"
                size="sm"
                href="/dashboard"
                iconEnd="arrow-right"
              />
            </div>
          </div>
        ) : null}

        {/* Everything the code can be wrong about arrives here, as one
            sentence. It says what to DO - ask for another one - because the
            person cannot tell which of the four reasons applies to them, and
            neither can this page. */}
        {query.error && query.error !== "MEMBER" ? (
          <Notice tone="danger" title="Ce code ne fonctionne pas">
            Il a peut-être expiré, ou il a déjà servi. Demandez-en un nouveau au
            propriétaire&nbsp;: il peut en émettre un depuis son équipe, et le
            nouveau remplace l'ancien. Vérifiez aussi qu'il a été recopié en
            entier, sans espace au début ni à la fin.
          </Notice>
        ) : null}

        <form className="card card--pad-lg stack stack-6" action={join}>
          <div className="field">
            <label className="field__label" htmlFor="code">
              Code d'invitation
              <span className="field__req" aria-hidden="true">*</span>
            </label>
            <input
              className="input"
              id="code"
              name="code"
              type="text"
              required
              // The contract's own bounds, to the character: a code is 20 to 64
              // of [A-Za-z0-9_-]. The browser catches a truncated paste before
              // the round trip; the server checks it again, because a pattern
              // in HTML is a convenience and never a guarantee.
              minLength={20}
              maxLength={64}
              pattern="[A-Za-z0-9_-]+"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              defaultValue={offered}
              aria-describedby="code_hint"
              aria-invalid={query.error && query.error !== "MEMBER" ? true : undefined}
            />
            <p className="field__hint" id="code_hint">
              Une longue suite de lettres et de chiffres. Collez-la telle
              quelle&nbsp;; les majuscules comptent.
            </p>
          </div>

          <div className="row row-3 row--wrap">
            <ActionButton
              label="Rejoindre l'équipe"
              type="submit"
              variant="primary"
              size="lg"
              icon="user-plus"
            />
          </div>
        </form>

        <section className="card card--pad card--sunken stack stack-4" aria-labelledby="savoir">
          <div className="row row-3">
            <span className="rule-accent" aria-hidden="true" />
            <h2 className="t-label" id="savoir">Bon à savoir</h2>
          </div>
          <ul className="stack stack-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <Fact icon="clock">
              Un code vaut sept jours et ne sert qu'une fois. Passé ce délai, ou
              une fois utilisé, il faut en demander un autre.
            </Fact>
            <Fact icon="user">
              Votre nom dans l'équipe est celui que le propriétaire a inscrit
              sur la place qu'il vous réserve. Vous ne le choisissez pas ici.
            </Fact>
            <Fact icon="store">
              Rejoindre n'est pas s'inscrire. Si vous voulez votre propre page
              et vos propres clients, c'est une inscription qu'il vous faut.
            </Fact>
          </ul>
          <div className="row row-3 row--wrap">
            <Button
              label="Inscrire mon activité"
              variant="ghost"
              size="sm"
              href="/inscription"
              iconEnd="arrow-right"
            />
          </div>
        </section>
      </main>

      <SiteFooter kind="pro" />
    </div>
  );
}

function Fact({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <li className="benefit">
      <span className="benefit__icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="benefit__text">{children}</span>
    </li>
  );
}
