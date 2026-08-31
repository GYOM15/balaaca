import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSignedIn, publicApi } from "@/lib/api";
import { env } from "@/lib/env";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ActionButton, Button, Notice } from "@/components/ui";
import type { CategoryList } from "@/lib/types";
import { register } from "./actions";
import "./register.css";

/** The taxonomy grows by migration, and a stale copy hides a trade. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inscrire mon activité" };

/**
 * Le lien public, tel que la personne le lira.
 *
 * <p>Built from the origin this server is reached at rather than written down:
 * a hardcoded domain reads as a promise, and it would be wrong on every
 * environment but one. In development it says localhost, which is exactly what
 * the link will be.
 */
const PUBLIC_HOST = new URL(env.publicOrigin).host;

type Search = {
  error?: string;
  /** What was typed, handed back so a refusal costs one word and not the form. */
  slug?: string;
  name?: string;
  category?: string;
};

/**
 * Inscrire une activité.
 *
 * <p>Not "inscrire mon salon". The hub carries a whole taxonomy of trades -
 * photographes, traiteurs, couturières, loueurs de salle - and a word that
 * names one of them tells the others this is not for them.
 *
 * <p>One screen and three fields, where the mockup drew a four-step wizard.
 * The wizard asked for a city, a district, a phone number and a presentation
 * that `POST /v1/providers` does not accept: it would have collected them, put
 * up a progress bar, and thrown four of the six answers away. The profile page
 * asks for those, after the business exists and where they are actually saved.
 */
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  // The proxy already covers this path. Kept anyway: the matcher is a list one
  // edit away from being wrong, and the cost of it being wrong here is an
  // anonymous visitor shown a form whose every submission answers 401.
  if (!(await isSignedIn())) redirect("/api/auth/login?next=/inscription");

  const query = await searchParams;
  const categories = await publicApi<CategoryList>("/v1/categories");

  const typedSlug = query.slug?.trim() ?? "";
  const typedName = query.name?.trim() ?? "";
  const typedCategory = query.category?.trim() ?? "";

  // One account, one business - so this refusal has no remedy on this page,
  // and showing the form under it would invite a second attempt that cannot
  // succeed. Everything below is the way out instead.
  if (query.error === "ALREADY_REGISTERED") {
    return (
      <Shell>
        <header className="stack stack-3">
          <h1 className="t-h2">Vous avez déjà une activité</h1>
          <p className="t-body t-muted measure" style={{ fontWeight: 400 }}>
            Un compte, une activité. Ce compte a déjà la sienne&nbsp;: il n'y a
            rien à corriger dans le formulaire, et le remplir à nouveau
            donnerait la même réponse.
          </p>
        </header>

        <div className="stack stack-5">
          <Notice tone="warning" title="Ce que vous cherchiez est peut-être ailleurs">
            Pour modifier votre page, ouvrez votre tableau de bord. Pour tenir
            une seconde activité, il faut un second compte. Et si quelqu'un vous
            a transmis un code, c'est une invitation à rejoindre son équipe, pas
            une inscription.
          </Notice>

          <div className="row row-3 row--wrap">
            <Button
              label="Ouvrir mon tableau de bord"
              variant="primary"
              href="/dashboard"
              iconEnd="arrow-right"
            />
            <Button
              label="J'ai un code d'invitation"
              variant="secondary"
              href="/rejoindre"
            />
          </div>
        </div>
      </Shell>
    );
  }

  const suggestion = query.error === "SLUG_UNAVAILABLE" ? variantOf(typedSlug) : null;

  return (
    <Shell>
      <header className="stack stack-3">
        <h1 className="t-h2">Inscrire mon activité</h1>
        <p className="t-body t-muted measure" style={{ fontWeight: 400 }}>
          Votre page est créée en sommeil&nbsp;: elle n'apparaît nulle part tant
          que vous ne l'avez pas publiée. Vous ajouterez ensuite vos
          prestations, vos horaires, et vous la mettrez en ligne quand elle vous
          conviendra.
        </p>
      </header>

      {query.error === "SLUG_UNAVAILABLE" ? (
        // The refusal and its way out, kept together. The suggestion sits
        // outside the notice rather than inside it: a notice is one tone
        // through and through, and a button borrowing that tone would read as
        // part of the warning instead of as the answer to it.
        <div className="stack stack-3">
          <Notice tone="warning" title="Cette adresse est déjà prise">
            {typedSlug ? (
              <>
                Une autre activité tient déjà <strong>{typedSlug}</strong>.
                Votre inscription n'est pas perdue&nbsp;: choisissez une autre
                adresse et rien d'autre ne change. Ajouter votre quartier ou
                votre prénom suffit presque toujours.
              </>
            ) : (
              <>
                Une autre activité tient déjà cette adresse. Choisissez-en une
                autre&nbsp;: ajouter votre quartier ou votre prénom suffit
                presque toujours.
              </>
            )}
          </Notice>
          {suggestion ? (
            <div className="row row-3 row--wrap">
              <Button
                label={`Essayer ${suggestion}`}
                variant="secondary"
                size="sm"
                icon="refresh"
                href={prefilled({
                  slug: suggestion,
                  name: typedName,
                  category: typedCategory,
                })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {query.error === "VALIDATION_FAILED" ? (
        <Notice tone="danger" title="L'adresse n'a pas la bonne forme">
          Elle ne prend que des minuscules, des chiffres et des tirets&nbsp;: ni
          espace, ni accent, ni point. Elle commence et finit par une lettre ou
          un chiffre, et compte entre 3 et 60 caractères.
        </Notice>
      ) : null}

      {query.error && !KNOWN.has(query.error) ? (
        <Notice tone="danger" title="L'inscription n'a pas abouti">
          Rien n'a été créé. Réessayez dans un instant&nbsp;; si la réponse est
          la même, ce n'est pas votre saisie qui est en cause.
        </Notice>
      ) : null}

      <form className="card card--pad-lg stack stack-6" action={register}>
        <div className="field">
          <label className="field__label" htmlFor="business_name">
            Nom de l'activité
            <span className="field__req" aria-hidden="true">*</span>
          </label>
          <input
            className="input"
            id="business_name"
            name="business_name"
            type="text"
            required
            maxLength={120}
            autoComplete="organization"
            defaultValue={typedName}
            placeholder="Ex. Studio Lumière, Atelier Mamadou, Le Bissap"
            aria-describedby="business_name_hint"
          />
          <p className="field__hint" id="business_name_hint">
            C'est le titre de votre page, tel que vos clients le liront. Il se
            modifie à tout moment.
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="slug">
            Adresse publique
            <span className="field__req" aria-hidden="true">*</span>
          </label>
          <div className="input-group slug-group">
            <span className="input-group__prefix" aria-hidden="true">
              {PUBLIC_HOST}/p/
            </span>
            <input
              className="input"
              id="slug"
              name="slug"
              type="text"
              required
              minLength={3}
              maxLength={60}
              // The contract's own pattern, to the character. The browser
              // refuses a malformed handle before the round trip; the server
              // refuses it again, because a pattern in HTML is a convenience
              // and never a guarantee.
              pattern="[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              defaultValue={typedSlug}
              placeholder="salon-awa"
              aria-describedby="slug_hint"
              aria-invalid={query.error === "SLUG_UNAVAILABLE" ? true : undefined}
            />
          </div>
          <p className="field__hint" id="slug_hint">
            Minuscules, chiffres et tirets. Ni espace, ni accent.
          </p>
        </div>

        {/* Placed inside the form, under the field it is about. A person reads
            this while the cursor is still in the box, which is the only moment
            it can change what they type. */}
        <Notice tone="neutral" icon="lock" title="Cette adresse ne changera plus">
          C'est la chaîne que porte votre QR code, celle que vous collerez sur
          votre vitrine et celle que vous enverrez par WhatsApp. La changer plus
          tard casserait tous les liens déjà remis à vos clients, alors elle est
          choisie une fois. Le nom de votre activité, lui, reste modifiable.
        </Notice>

        <div className="field">
          <label className="field__label" htmlFor="category_slug">
            Métier
          </label>
          <select
            className="select"
            id="category_slug"
            name="category_slug"
            defaultValue={typedCategory}
            aria-describedby="category_hint"
          >
            <option value="">Je choisirai plus tard</option>
            {categories.data.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.label_fr}
              </option>
            ))}
          </select>
          <p className="field__hint" id="category_hint">
            Il range votre page dans l'annuaire&nbsp;: c'est par là qu'un client
            qui ne vous connaît pas encore vous trouve. Modifiable ensuite.
          </p>
        </div>

        <div className="row row-3 row--wrap">
          <ActionButton
            label="Créer mon activité"
            type="submit"
            variant="primary"
            size="lg"
            iconEnd="arrow-right"
          />
        </div>
      </form>

      <section className="card card--pad card--sunken stack stack-4" aria-labelledby="apres">
        <div className="row row-3">
          <span className="rule-accent" aria-hidden="true" />
          <h2 className="t-label" id="apres">Ensuite</h2>
        </div>
        <ol className="stack stack-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <NextStep n={1} title="Vos prestations">
            Un nom, une durée, un prix. La durée est ce qui calcule vos créneaux
            et empêche deux clients de se chevaucher.
          </NextStep>
          <NextStep n={2} title="Vos horaires">
            Les jours et les heures où vous recevez. Sans eux, personne ne peut
            réserver.
          </NextStep>
          <NextStep n={3} title="La mise en ligne">
            Vous publiez quand vous le décidez. C'est à ce moment-là, et pas
            avant, que votre page apparaît dans l'annuaire.
          </NextStep>
        </ol>
      </section>
    </Shell>
  );
}

/** The chrome, written once: three returns share it. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SiteHeader kind="pro" />
      <main
        className="site__main container container--booking section stack stack-8"
        id="contenu"
      >
        {children}
      </main>
      <SiteFooter kind="pro" />
    </div>
  );
}

function NextStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="step">
      <span className="step__num" aria-hidden="true">{n}</span>
      <span className="grow stack stack-1">
        <span className="step__title">{title}</span>
        <span className="step__text">{children}</span>
      </span>
    </li>
  );
}

/** The refusals this page has words for. Anything else gets the plain one. */
const KNOWN = new Set(["SLUG_UNAVAILABLE", "ALREADY_REGISTERED", "VALIDATION_FAILED"]);

/**
 * Une adresse voisine, à un clic.
 *
 * <p>A numbered variant and nothing cleverer, because only the server knows
 * what is free: this is a starting point, not a promise, and it is offered
 * rather than substituted so the person still sees the handle they asked for.
 * `salon-awa` becomes `salon-awa-2` and `salon-awa-2` becomes `salon-awa-3`,
 * so clicking twice does not walk into the same refusal twice.
 *
 * <p>Returns null when the result would not satisfy the contract's pattern -
 * suggesting something the server is bound to reject would be worse than
 * suggesting nothing.
 */
function variantOf(slug: string): string | null {
  const match = /^([a-z0-9][a-z0-9-]*[a-z0-9])-(\d{1,4})$/.exec(slug);
  const base = match?.[1] ?? slug;
  const digits = match?.[2];
  const next = digits ? Number(digits) + 1 : 2;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(base)) return null;

  const candidate = `${base}-${next}`;
  return candidate.length >= 3 && candidate.length <= 60 ? candidate : null;
}

/** The same page with the boxes already filled: a link, so it needs no script. */
function prefilled(values: { slug: string; name: string; category: string }): string {
  const query = new URLSearchParams({ slug: values.slug });
  if (values.name) query.set("name", values.name);
  if (values.category) query.set("category", values.category);
  return `/inscription?${query.toString()}`;
}
