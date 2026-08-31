import { redirect } from "next/navigation";
import { publicApi, isSignedIn } from "@/lib/api";
import type { CategoryList } from "@/lib/types";
import { register } from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  SLUG_UNAVAILABLE:
    "Cette adresse est deja prise. Choisissez-en une autre : ajoutez le quartier, ou votre prenom.",
  ALREADY_REGISTERED:
    "Ce compte a deja une activite. Un compte, une activite.",
  VALIDATION_FAILED:
    "L'adresse ne prend que des minuscules, des chiffres et des tirets.",
};

/**
 * Inscrire une activite.
 *
 * <p>Not "inscrire mon salon". The hub carries eighteen trades - photographes,
 * traiteurs, couturieres, loueurs de salle - and a word that names one of them
 * tells the other seventeen this is not for them.
 */
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await isSignedIn())) redirect("/api/auth/login?next=/inscription");
  const query = await searchParams;
  const categories = await publicApi<CategoryList>("/v1/categories");

  return (
    <main>
      <h1>Inscrire mon activite</h1>
      <p>
        Votre page est creee en sommeil&nbsp;: elle n'apparait nulle part tant
        que vous ne l'avez pas publiee. Vous ajouterez ensuite vos prestations
        et vos horaires.
      </p>

      {query.error ? (
        <p className="problem">{REFUSALS[query.error] ?? "L'inscription n'a pas abouti."}</p>
      ) : null}

      <form action={register}>
        <label>
          Nom de l'activite
          <input type="text" name="business_name" required maxLength={120} />
        </label>
        <label>
          Adresse publique
          <input
            type="text"
            name="slug"
            required
            minLength={3}
            maxLength={60}
            pattern="[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])"
            placeholder="salon-awa"
          />
          <small>
            C'est ce que vos clients liront sur le QR code. Choisie une fois,
            elle ne change plus.
          </small>
        </label>
        <label>
          Metier
          <select name="category_slug" defaultValue="">
            <option value="">Je choisirai plus tard</option>
            {categories.data.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.label_fr}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Creer mon activite</button>
      </form>
    </main>
  );
}
