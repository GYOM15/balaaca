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
 * The public link, exactly as the person will read it.
 *
 * <p>Built from the origin this server is reached at rather than written down:
 * the design prints `balaaca.gn/p/` because a static mock has one environment,
 * and a hardcoded domain here would be wrong on every environment but one. In
 * development it says localhost, which is exactly what the link will be.
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
 * Registering an activity.
 *
 * <p>Not "inscrire mon salon". The hub carries a whole taxonomy of trades -
 * photographers, caterers, dressmakers, hall renters - and a word that names
 * one of them tells the others this is not for them.
 *
 * <p>One screen and three fields. The readiness thread the design draws after
 * it - "activité, prestation, disponibilités, publier" - lives on the
 * dashboard, which is where those four answers are actually saved.
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
          <Refusal code="SLUG_UNAVAILABLE" title="Cette adresse est déjà prise">
            Choisissez un autre identifiant : il figurera sur votre lien et
            votre QR code, et ne changera plus.
          </Refusal>
        </div>
      ) : null}

      {query.error === "VALIDATION_FAILED" ? (
        <div style={{ marginTop: "var(--s-6)" }}>
          <Refusal code="VALIDATION_FAILED" title="L’adresse n’a pas la bonne forme">
            Elle ne prend que des minuscules, des chiffres et des tirets : ni
            espace, ni accent, ni point. Elle commence et finit par une lettre
            ou un chiffre, et compte entre 3 et 60 caractères.
          </Refusal>
        </div>
      ) : null}

      {query.error === "RATE_LIMITED" ? (
        <div style={{ marginTop: "var(--s-6)" }}>
          <Refusal code="RATE_LIMITED" title="Trop de demandes d’un coup">
            Rien n’a été créé. Attendez un instant et renvoyez le formulaire :
            c’est le rythme des envois qui est en cause, pas votre saisie.
          </Refusal>
        </div>
      ) : null}

      {query.error && !KNOWN.has(query.error) ? (
        <div style={{ marginTop: "var(--s-6)" }}>
          <Refusal code={query.error} title="L’inscription n’a pas abouti">
            Rien n’a été créé. Réessayez dans un instant ; si la réponse est la
            même, ce n’est pas votre saisie qui est en cause.
          </Refusal>
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
            type="text"
            id="business_name"
            name="business_name"
            placeholder="Salon Aïssatou"
            required
            maxLength={120}
            autoComplete="organization"
            defaultValue={typedName}
            aria-describedby="business_name_hint"
          />
          <p className="field__hint" id="business_name_hint">
            Le nom que vos clients connaissent, tel qu’il est écrit sur votre
            enseigne.
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="slug">
            Adresse de votre page <span className="field__req" aria-hidden="true">*</span>
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
            // The refusal replaces the hint, under the box it is about, with a
            // neighbouring handle to try. Only the server knows what is free,
            // so it is offered rather than substituted.
            <p className="field__error" id="slug_hint">
              <Icon name="alert-circle" size={16} /> Cette adresse est déjà
              utilisée.
              {suggestion ? (
                <>
                  {" "}
                  Essayez <strong>{suggestion}</strong>.
                </>
              ) : null}
            </p>
          ) : (
            <p className="field__hint" id="slug_hint">
              <Icon name="lock" size={16} /> Cette adresse ne changera jamais :
              elle sera imprimée sur votre QR code et envoyée à vos clients.
            </p>
          )}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="category_slug">
            Votre métier <span className="field__req" aria-hidden="true">*</span>
          </label>
          {/* No `required` attribute, exactly as the design draws it: the
              asterisk is the house style for a field somebody should fill, and
              `POST /v1/providers` omits `category_slug` when none is chosen.
              Enforcing it here would refuse a submission the server accepts. */}
          <select
            className="select"
            id="category_slug"
            name="category_slug"
            defaultValue={typedCategory}
            aria-describedby="category_hint"
          >
            <option value="">Choisir un métier</option>
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
            Un seul métier par établissement. Vos prestations peuvent en
            revanche être très variées.
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
            Déjà inscrit ?{" "}
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
 * <p>Stripped to the mark and one way back, as the design draws this route.
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

/**
 * A refusal, at the top of the page.
 *
 * <p>The design system's `.alert`, written out rather than taken from
 * `Notice`, for the one attribute `Notice` does not carry: the design puts the
 * published error code on the element itself, so what the server refused is
 * legible in the DOM and not only in the sentence.
 */
function Refusal({
  code,
  title,
  children,
}: {
  code: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="alert alert--danger" role="alert" data-error-code={code}>
      <span className="alert__icon">
        <Icon name="alert-circle" />
      </span>
      <div className="grow">
        <div className="alert__title">{title}</div>
        <div className="alert__body">{children}</div>
      </div>
    </div>
  );
}

/** The refusals this page has words for. Anything else gets the plain one. */
const KNOWN = new Set([
  "SLUG_UNAVAILABLE",
  "ALREADY_REGISTERED",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
]);

type CategoryGroup = { label: string; items: CategoryList["data"] };

/**
 * The trades, grouped by family.
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
 * A neighbouring address, to try.
 *
 * <p>A numbered variant and nothing cleverer, because only the server knows
 * what is free: this is a starting point, not a promise. `salon-awa` becomes
 * `salon-awa-2` and `salon-awa-2` becomes `salon-awa-3`, so a second attempt
 * does not walk into the same refusal twice.
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
