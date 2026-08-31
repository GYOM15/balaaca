import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { Icon } from "@/components/icon";
import { ActionButton, Badge, EmptyState, Notice, SectionHead } from "@/components/ui";
import type { ServiceOffering, ServiceOfferingPage } from "@/lib/types";
import { createService, replaceService } from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire modifie le catalogue.",
  VALIDATION_FAILED: "Vérifiez la durée (au moins 1 minute) et le prix.",
  RESOURCE_NOT_FOUND: "Cette prestation n'existe plus.",
};

/**
 * The catalogue.
 *
 * <p>Nothing is deleted here, and the page says so: a retired service is kept
 * because appointments booked at its price still name it, and removing the row
 * would take that history with it. What looks like deletion is the box marked
 * "proposée aux clients", unticked.
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
  // and the launch market's franc is a default they can change - not a market
  // this product is pinned to.
  const currency = services.data[0]?.price.currency ?? "GNF";
  const live = services.data.filter((s) => s.active);

  return (
    <div className="stack stack-8">
      <header className="pro-head">
        <h1 className="pro-head__title">Prestations</h1>
        <p className="t-small t-muted">
          Ce que vos clients peuvent réserver, avec la durée et le prix que vous
          affichez.
        </p>
      </header>

      {query.error ? (
        <Notice tone="danger" title="L'enregistrement n'a pas abouti">
          {REFUSALS[query.error] ?? "Réessayez, ou rechargez la page."}
        </Notice>
      ) : null}

      <section className="stack stack-4">
        <SectionHead
          label="Au catalogue"
          aside={
            services.data.length > 0
              ? `${live.length} en ligne sur ${services.data.length}`
              : undefined
          }
        />

        {services.data.length === 0 ? (
          <EmptyState
            sketch="tools"
            title="Aucune prestation"
            body="Votre page ne peut pas être réservée tant qu'elle n'en porte aucune. Une durée, un prix, et c'est réservable."
          />
        ) : (
          <div className="stack stack-3">
            {services.data.map((service) => (
              <details className="card card--pad svc-card" key={service.service_offering_id}>
                <summary className="row row--between row-3 row--wrap">
                  <span className="grow stack stack-1">
                    <span className="t-body" style={{ fontWeight: 600 }}>
                      {service.name}
                    </span>
                    <span className="t-caption t-dim">
                      <span className="tnum">{money(service.price)}</span>
                      {" · "}
                      <span className="tnum">{service.duration_minutes} min</span>
                      {service.buffer_before_minutes + service.buffer_after_minutes > 0 ? (
                        <>
                          {" · +"}
                          <span className="tnum">
                            {service.buffer_before_minutes + service.buffer_after_minutes} min
                          </span>
                          {" de battement"}
                        </>
                      ) : null}
                    </span>
                  </span>
                  {service.active ? null : <Badge label="Retirée" tone="outline" />}
                  {service.active && !service.price_visible ? (
                    <Badge label="Prix masqué" tone="neutral" icon="eye-off" />
                  ) : null}
                </summary>

                <form action={replaceService} className="stack stack-4" style={{ marginTop: "var(--space-4)" }}>
                  <input type="hidden" name="id" value={service.service_offering_id} />
                  <Fields service={service} currency={currency} />
                  <ActionButton label="Enregistrer" variant="primary" type="submit" icon="check" />
                </form>
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="stack stack-4">
        <SectionHead label="Ajouter une prestation" />
        <form action={createService} className="card card--pad-lg stack stack-4">
          <Fields service={null} currency={currency} />
          <ActionButton label="Ajouter" variant="primary" type="submit" icon="plus" />
        </form>
      </section>
    </div>
  );
}

/**
 * Every field, always.
 *
 * <p>The API replaces the whole offering, so a field this form left out would
 * be a field the save cleared. That is why an edit form and a creation form are
 * the same form.
 */
function Fields({
  service,
  currency,
}: {
  service: ServiceOffering | null;
  currency: string;
}) {
  return (
    <>
      <label className="field">
        <span className="field__label">
          Nom<span className="field__req" aria-hidden="true">*</span>
        </span>
        <input
          className="input"
          type="text"
          name="name"
          required
          maxLength={120}
          defaultValue={service?.name ?? ""}
          placeholder="Tresses collées, coupe & brushing…"
        />
      </label>

      <label className="field">
        <span className="field__label">Description</span>
        <textarea
          className="textarea"
          name="description"
          rows={2}
          defaultValue={service?.description ?? ""}
          placeholder="Ce que la cliente doit savoir avant de réserver."
        />
      </label>

      <div className="row row-3 row--wrap row--top">
        <label className="field">
          <span className="field__label">
            Durée (min)<span className="field__req" aria-hidden="true">*</span>
          </span>
          <input
            className="input"
            type="number"
            name="duration_minutes"
            required
            min={1}
            max={720}
            defaultValue={service?.duration_minutes ?? 30}
          />
        </label>
        <label className="field">
          <span className="field__label">
            Prix<span className="field__req" aria-hidden="true">*</span>
          </span>
          <input
            className="input"
            type="number"
            name="amount_minor"
            required
            min={0}
            defaultValue={service?.price.amount_minor ?? 0}
          />
        </label>
        <label className="field">
          <span className="field__label">Monnaie</span>
          <input
            className="input"
            type="text"
            name="currency"
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            size={5}
            defaultValue={service?.price.currency ?? currency}
          />
        </label>
        <label className="field">
          <span className="field__label">Ordre</span>
          <input
            className="input"
            type="number"
            name="sort_order"
            size={5}
            defaultValue={service?.sort_order ?? 0}
          />
        </label>
      </div>

      <div className="row row-3 row--wrap row--top">
        <label className="field">
          <span className="field__label">Battement avant</span>
          <input
            className="input"
            type="number"
            name="buffer_before_minutes"
            min={0}
            max={240}
            defaultValue={service?.buffer_before_minutes ?? 0}
          />
        </label>
        <label className="field">
          <span className="field__label">Battement après</span>
          <input
            className="input"
            type="number"
            name="buffer_after_minutes"
            min={0}
            max={240}
            defaultValue={service?.buffer_after_minutes ?? 0}
          />
        </label>
      </div>
      <p className="field__hint">
        <Icon name="info" size={14} /> Le temps de préparer et de balayer entre
        deux clientes. L'agenda le réserve sans le facturer.
      </p>

      <label className="switch">
        <input type="checkbox" name="price_visible" defaultChecked={service?.price_visible ?? true} />
        <span className="switch__track"><span className="switch__thumb" /></span>
        <span className="grow">
          <span className="t-small">Afficher le prix sur ma page</span>
          <span className="field__hint" style={{ display: "block" }}>
            Masqué, la prestation reste réservable et la cliente vous demande le prix.
          </span>
        </span>
      </label>

      <label className="switch">
        <input type="checkbox" name="active" defaultChecked={service?.active ?? true} />
        <span className="switch__track"><span className="switch__thumb" /></span>
        <span className="grow">
          <span className="t-small">Proposée aux clients</span>
          <span className="field__hint" style={{ display: "block" }}>
            Décochée, elle disparaît de votre page. Rien ne se supprime&nbsp;:
            les rendez-vous déjà pris portent encore son prix.
          </span>
        </span>
      </label>
    </>
  );
}
