import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { ServiceOfferingPage } from "@/lib/types";
import { createService, replaceService } from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le proprietaire modifie le catalogue.",
  VALIDATION_FAILED: "Verifiez la duree et le prix.",
  RESOURCE_NOT_FOUND: "Cette prestation n'existe plus.",
};

/**
 * The catalogue.
 *
 * <p>Nothing is deleted. A retired service is kept because appointments booked
 * at its price still name it, and removing the row would take that history with
 * it - so what looks like deletion is the `active` box, unticked.
 */
export default async function Services({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const services = await api<ServiceOfferingPage>("/v1/service-offerings", {
    query: { limit: 100 },
  });

  // What this provider already sells in. A first service has nothing to copy,
  // and the launch market's franc is the default the provider can change -
  // which is a default, not a market this product is pinned to.
  const currency = services.data[0]?.price.currency ?? "GNF";

  return (
    <main>
      <h2>Prestations</h2>

      {query.error ? (
        <p className="problem">{REFUSALS[query.error] ?? "La demande n'a pas abouti."}</p>
      ) : null}

      {services.data.map((service) => (
        <details key={service.service_offering_id}>
          <summary>
            {service.name} — {service.duration_minutes} min — {money(service.price)}
            {service.active ? "" : " (retiree)"}
          </summary>
          <form action={replaceService}>
            <input type="hidden" name="id" value={service.service_offering_id} />
            <Fields service={service} currency={currency} />
            <button type="submit">Enregistrer</button>
          </form>
        </details>
      ))}

      <h3>Ajouter une prestation</h3>
      <form action={createService}>
        <Fields service={null} currency={currency} />
        <button type="submit">Ajouter</button>
      </form>
    </main>
  );
}

/**
 * Every field, always. The API replaces the whole offering, so a field this
 * form omitted would be a field the save cleared.
 */
function Fields({
  service,
  currency,
}: {
  service: ServiceOfferingPage["data"][number] | null;
  currency: string;
}) {
  return (
    <>
      <label>
        Nom
        <input type="text" name="name" required maxLength={120} defaultValue={service?.name ?? ""} />
      </label>
      <label>
        Description
        <textarea name="description" rows={2} defaultValue={service?.description ?? ""} />
      </label>
      <div className="row">
        <label>
          Duree (min)
          <input
            type="number"
            name="duration_minutes"
            required
            min={1}
            max={720}
            defaultValue={service?.duration_minutes ?? 30}
          />
        </label>
        <label>
          Battement avant
          <input
            type="number"
            name="buffer_before_minutes"
            min={0}
            max={240}
            defaultValue={service?.buffer_before_minutes ?? 0}
          />
        </label>
        <label>
          Battement apres
          <input
            type="number"
            name="buffer_after_minutes"
            min={0}
            max={240}
            defaultValue={service?.buffer_after_minutes ?? 0}
          />
        </label>
        <label>
          Prix
          <input
            type="number"
            name="amount_minor"
            required
            min={0}
            defaultValue={service?.price.amount_minor ?? 0}
          />
        </label>
        <label>
          Monnaie
          <input
            type="text"
            name="currency"
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            defaultValue={service?.price.currency ?? currency}
          />
        </label>
        <label>
          Ordre
          <input type="number" name="sort_order" defaultValue={service?.sort_order ?? 0} />
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          name="price_visible"
          defaultChecked={service?.price_visible ?? true}
        />{" "}
        Afficher le prix sur ma page
      </label>
      <label>
        <input type="checkbox" name="active" defaultChecked={service?.active ?? true} /> Proposee
        aux clients
      </label>
    </>
  );
}
