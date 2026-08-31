import Link from "next/link";
import { publicApi } from "@/lib/api";
import type { CategoryList, ProviderSummaryPage } from "@/lib/types";

/**
 * The hub, and it is a search box.
 *
 * <p>Somebody arriving wants to find a hairdresser, not to be told what this
 * platform is - so the first thing on the page is the field they type into, and
 * results replace it in place. There is no "find a professional" step between
 * the door and the search: an extra click before a query is a page nobody reads
 * and everybody clicks through.
 *
 * <p>Rendered on the server on every request, with no cache: the directory
 * changes when a provider publishes, and a stale hub is a hub that hides a
 * business that has just opened.
 */
export const dynamic = "force-dynamic";

type Search = { q?: string; category_slug?: string | string[]; city?: string };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const selected = toList(params.category_slug);
  const city = params.city?.trim() ?? "";

  const categories = await publicApi<CategoryList>("/v1/categories");

  // Below two characters the API refuses, and it is right to: one letter
  // matches most of the directory and answers nothing. So an empty box lists
  // the hub rather than asking a question with no answer.
  const asked = q.length >= 2 || selected.length > 0 || city.length > 0;
  const results = await publicApi<ProviderSummaryPage>("/v1/providers", {
    query: {
      q: q.length >= 2 ? q : undefined,
      category_slug: selected.length > 0 ? selected : undefined,
      city: city || undefined,
      limit: 24,
    },
  });

  return (
    <main>
      <h1>Balaaca</h1>

      <form method="get" action="/">
        <label>
          Que cherchez-vous&nbsp;?
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="tresses, barbier, traiteur, un nom de salon..."
            autoFocus
          />
        </label>
        <div className="row">
          <label>
            Ville
            <input type="text" name="city" defaultValue={city} placeholder="Conakry" />
          </label>
          <label>
            Metier
            <select name="category_slug" defaultValue={selected[0] ?? ""}>
              <option value="">Tous les metiers</option>
              {categories.data.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label_fr}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Rechercher</button>
        </div>
      </form>

      <h2>
        {asked ? `${results.data.length} resultat(s)` : "Les professionnels inscrits"}
      </h2>

      {results.data.length === 0 ? (
        <p>Aucun professionnel ne correspond. Essayez un autre mot, ou une autre ville.</p>
      ) : (
        <ul>
          {results.data.map((provider) => (
            <li key={provider.slug}>
              <Link href={`/p/${provider.slug}`}>{provider.business_name}</Link>
              {provider.city ? ` — ${provider.city}` : null}
              {provider.description ? <div>{provider.description}</div> : null}
            </li>
          ))}
        </ul>
      )}

      <hr />
      <p>
        Vous etes professionnel&nbsp;?{" "}
        <Link href="/inscription">Inscrire mon activite</Link> — ou{" "}
        <Link href="/dashboard">ouvrir mon tableau de bord</Link>, ou{" "}
        <Link href="/rejoindre">rejoindre une equipe</Link>.
      </p>
    </main>
  );
}

/** One value or several: the contract repeats the parameter rather than joining it. */
function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
