import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn, publicApi } from "@/lib/api";
import { env } from "@/lib/env";
import { Icon } from "@/components/icon";
import { ActionButton, Button, Notice, Wordmark } from "@/components/ui";
import type { CategoryList } from "@/lib/types";
import { register } from "./actions";

/** The taxonomy grows by migration, and a stale copy hides a trade. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Créer ma page" };

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
 * up a progress bar, and thrown four of the six answers away. The dashboard
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
        <p className="t-overline">Créer ma page</p>
        <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
          Vous avez déjà une activité
        </h1>
        <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
          Un compte, une activité. Ce compte a déjà la sienne&nbsp;: il n’y a
          rien à corriger dans le formulaire, et le remplir à nouveau donnerait
          la même réponse.
        </p>

        <div style={{ marginTop: "var(--s-6)" }}>
          <Notice tone="warning" title="Ce que vous cherchiez est peut-être ailleurs">
            Pour modifier votre page, ouvrez votre espace. Pour tenir une
            seconde activité, il faut un second compte. Et si quelqu’un vous a
            transmis un code, c’est une invitation à rejoindre son équipe, pas
            une inscription.
          </Notice>
        </div>

        <div className="row row--wrap" style={{ marginTop: "var(--s-6)" }}>
          <Button
            label="Accéder à mon espace"
            variant="primary"
            href="/dashboard"
            iconEnd="arrow-right"
          />
          <Button
            label="J’ai un code d’invitation"
            variant="secondary"
            href="/rejoindre"
          />
        </div>
      </Shell>
    );
  }

  const taken = query.error === "SLUG_UNAVAILABLE";
  const suggestion = taken ? variantOf(typedSlug) : null;

  return (
    <Shell>
      <p className="t-overline">Créer ma page</p>
      <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
        Trois informations, et votre page existe
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
        Vous pourrez tout compléter ensuite. Rien n’est publié tant que vous ne
        l’avez pas décidé.
      </p>

      {taken ? (
        <div style={{ marginTop: "var(--s-6)" }}>
          <Notice tone="danger" title="Cette adresse est déjà prise">
            Choisissez un autre identifiant&nbsp;: il figurera sur votre lien et
            votre QR code, et ne changera plus.
          </Notice>
        </div>
      ) : null}

      {query.error === "VALIDATION_FAILED" ? (
        <div style={{ marginTop: "var(--s-6)" }}>
          <Notice tone="danger" title="L’adresse n’a pas la bonne forme">
            Elle ne prend que des minuscules, des chiffres et des tirets&nbsp;:
            ni espace, ni accent, ni point. Elle commence et finit par une
            lettre ou un chiffre, et compte entre 3 et 60 caractères.
          </Notice>
        </div>
      ) : null}

      {query.error && !KNOWN.has(query.error) ? (
        <div style={{ marginTop: "var(--s-6)" }}>
          <Notice tone="danger" title="L’inscription n’a pas abouti">
            Rien n’a été créé. Réessayez dans un instant&nbsp;; si la réponse
            est la même, ce n’est pas votre saisie qui est en cause.
          </Notice>
        </div>
      ) : null}

      <form className="card card--pad" style={{ marginTop: "var(--s-8)" }} action={register}>
        <div className="field">
          <label className="field__label" htmlFor="business_name">
            Nom de l’établissement
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
            placeholder="Salon Aïssatou"
            aria-describedby="business_name_hint"
          />
          <p className="field__hint" id="business_name_hint">
            Le nom que vos clients connaissent, tel qu’il est écrit sur votre
            enseigne. Il se modifie à tout moment.
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="slug">
            Adresse de votre page
            <span className="field__req" aria-hidden="true">*</span>
          </label>
          <div className="input-group input-group--suffix">
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
              placeholder="salon-aissatou"
              style={{ paddingLeft: "9.5rem" }}
              aria-describedby="slug_hint"
              aria-invalid={taken ? true : undefined}
            />
            <span
              className="input-group__icon"
              aria-hidden="true"
              style={{
                pointerEvents: "none",
                left: "var(--s-4)",
                color: "var(--text-tertiary)",
                fontSize: "var(--fs-sm)",
                fontWeight: 600,
              }}
            >
              {PUBLIC_HOST}/p/
            </span>
          </div>
          {taken ? (
            // The refusal sits under the box it is about, with the way out
            // inside it: a neighbouring handle, offered as a link so the form
            // comes back filled and nothing has to be typed twice.
            <p className="field__error" id="slug_hint">
              <Icon name="alert-circle" size={16} />
              <span>
                Cette adresse est déjà utilisée.
                {suggestion ? (
                  <>
                    {" "}
                    Essayez{" "}
                    <Link
                      className="link"
                      href={prefilled({
                        slug: suggestion,
                        name: typedName,
                        category: typedCategory,
                      })}
                    >
                      <strong>{suggestion}</strong>
                    </Link>
                    .
                  </>
                ) : null}
              </span>
            </p>
          ) : (
            <p className="field__hint" id="slug_hint">
              <Icon name="lock" size={16} /> Cette adresse ne changera
              jamais&nbsp;: elle sera imprimée sur votre QR code et envoyée à
              vos clients. Minuscules, chiffres et tirets, sans espace ni
              accent.
            </p>
          )}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="category_slug">
            Votre métier
            {/* Optional, and said so: `POST /v1/providers` omits the field
                when none is chosen, so the asterisk the mockup draws here
                would announce a rule the server does not enforce. */}
            <span className="field__optional">facultatif</span>
          </label>
          <select
            className="select"
            id="category_slug"
            name="category_slug"
            defaultValue={typedCategory}
            aria-describedby="category_hint"
          >
            <option value="">Je choisirai plus tard</option>
            {groupByFamily(categories.data).map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.label_fr}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="field__hint" id="category_hint">
            Un seul métier par établissement, et il range votre page dans
            l’annuaire&nbsp;: c’est par là qu’un client qui ne vous connaît pas
            encore vous trouve. Vos prestations, elles, peuvent être très
            variées.
          </p>
        </div>

        <div style={{ marginTop: "var(--s-6)" }}>
          <ActionButton
            label="Créer ma page"
            type="submit"
            variant="primary"
            size="lg"
            block
          />
          <p className="t-xs" style={{ textAlign: "center", marginTop: "var(--s-4)" }}>
            Déjà inscrit&nbsp;?{" "}
            <Link className="link" href="/dashboard">
              Accéder à mon espace
            </Link>
          </p>
        </div>
      </form>
    </Shell>
  );
}

/**
 * The chrome, written once: two returns share it.
 *
 * <p>Stripped to the mark and one way back, as the mockup draws this route.
 * The full navigation belongs on pages somebody is browsing; here it is one
 * task, and every extra door is a way to abandon it.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="hdr">
        <div className="page hdr__in">
          <Wordmark size={34} />
          <div className="hdr__actions">
            <Link className="hdr__link" href="/professionnels">
              Retour
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
          {children}
        </div>
      </main>
    </>
  );
}

/** The refusals this page has words for. Anything else gets the plain one. */
const KNOWN = new Set(["SLUG_UNAVAILABLE", "ALREADY_REGISTERED", "VALIDATION_FAILED"]);

type CategoryGroup = { label: string; items: CategoryList["data"] };

/**
 * Les métiers, rangés par famille.
 *
 * <p>Thirty-five trades in one flat list is thirty-four to scroll past to
 * reach yours. The families come from the contract, which calls them optional -
 * a trade that belongs to none lands in a bucket rather than nowhere, and the
 * server's own order is kept so this page never decides what comes first.
 */
function groupByFamily(categories: CategoryList["data"]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  const byLabel = new Map<string, CategoryGroup>();
  for (const category of categories) {
    const label = category.family?.label_fr ?? "Divers";
    let group = byLabel.get(label);
    if (!group) {
      group = { label, items: [] };
      byLabel.set(label, group);
      groups.push(group);
    }
    group.items.push(category);
  }
  return groups;
}

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
