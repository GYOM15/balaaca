import { api, publicApi } from "@/lib/api";
import type { BookingPolicy, CategoryList, ProviderProfile } from "@/lib/types";
import { saveProfile, savePolicy } from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le proprietaire modifie la page et les reglages.",
  NOTHING_TO_PUBLISH:
    "Il faut au moins une prestation, des horaires et quelqu'un de reservable avant de publier.",
  VALIDATION_FAILED: "Verifiez le numero de telephone et le fuseau horaire.",
};

export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const [profile, policy, categories] = await Promise.all([
    api<ProviderProfile>("/v1/provider-profile"),
    api<BookingPolicy>("/v1/booking-policy"),
    publicApi<CategoryList>("/v1/categories"),
  ]);

  return (
    <main>
      <h2>Ma page</h2>

      {query.error ? (
        <p className="problem">{REFUSALS[query.error] ?? "L'enregistrement n'a pas abouti."}</p>
      ) : null}

      <p>
        Adresse publique&nbsp;: <code>/p/{profile.slug}</code> — choisie une
        fois, elle ne change plus.
      </p>

      <form action={saveProfile}>
        <label>
          Nom
          <input
            type="text"
            name="business_name"
            required
            maxLength={120}
            defaultValue={profile.business_name}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            rows={4}
            maxLength={2000}
            defaultValue={profile.description ?? ""}
          />
        </label>
        <div className="row">
          <label>
            Metier
            <select name="category_slug" defaultValue={profile.category_slug ?? ""}>
              <option value="">Non precise</option>
              {categories.data.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label_fr}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ville
            <input type="text" name="city" maxLength={80} defaultValue={profile.city ?? ""} />
          </label>
          <label>
            Fuseau horaire
            <input
              type="text"
              name="timezone"
              required
              maxLength={64}
              defaultValue={profile.timezone}
            />
          </label>
        </div>
        <label>
          Adresse
          <input
            type="text"
            name="address_line"
            maxLength={200}
            defaultValue={profile.address_line ?? ""}
          />
        </label>
        <div className="row">
          <label>
            Telephone public
            <input
              type="tel"
              name="public_phone_e164"
              pattern="\+[1-9][0-9]{7,14}"
              placeholder="+224622000001"
              defaultValue={profile.public_phone_e164 ?? ""}
            />
          </label>
          <label>
            WhatsApp
            <input
              type="tel"
              name="whatsapp_phone_e164"
              pattern="\+[1-9][0-9]{7,14}"
              defaultValue={profile.whatsapp_phone_e164 ?? ""}
            />
          </label>
          <label>
            Courriel public
            <input
              type="email"
              name="public_email"
              maxLength={200}
              defaultValue={profile.public_email ?? ""}
            />
          </label>
        </div>
        <label>
          <input type="checkbox" name="published" defaultChecked={profile.published} /> Ma page
          est visible par les clients
        </label>
        <button type="submit">Enregistrer ma page</button>
      </form>

      <h2>Reglages de reservation</h2>
      <p>
        Comment tourne votre carnet. Ce n'est pas ce qu'un client lit&nbsp;: ce
        sont les regles qui decident quand il peut reserver.
      </p>
      <form action={savePolicy}>
        <div className="row">
          <label>
            Pas des creneaux (min)
            <input
              type="number"
              name="slot_granularity_minutes"
              required
              min={5}
              max={120}
              defaultValue={policy.slot_granularity_minutes}
            />
          </label>
          <label>
            Delai de prevenance (min)
            <input
              type="number"
              name="min_lead_time_minutes"
              required
              min={0}
              max={20160}
              defaultValue={policy.min_lead_time_minutes}
            />
          </label>
          <label>
            Horizon (jours)
            <input
              type="number"
              name="max_advance_days"
              required
              min={1}
              max={365}
              defaultValue={policy.max_advance_days}
            />
          </label>
          <label>
            Annulation possible jusqu'a (min avant)
            <input
              type="number"
              name="cancellation_deadline_minutes"
              required
              min={0}
              max={20160}
              defaultValue={policy.cancellation_deadline_minutes}
            />
          </label>
        </div>
        <label>
          <input type="checkbox" name="auto_confirm" defaultChecked={policy.auto_confirm} />{" "}
          Confirmer automatiquement les demandes
        </label>
        <button type="submit">Enregistrer les reglages</button>
      </form>
    </main>
  );
}
