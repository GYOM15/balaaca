import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { api } from "@/lib/api";
import { mediaUrl, money } from "@/lib/format";
import { Icon } from "@/components/icon";
import { ActionButton, Badge, Button, EmptyState, Notice } from "@/components/ui";
import type {
  Fulfilment,
  PerformerList,
  ServiceOffering,
  ServiceOfferingPage,
  ServicePhotoList,
  StaffList,
} from "@/lib/types";
import {
  addServicePhoto,
  createService,
  removeServicePhoto,
  replacePerformers,
  replaceService,
} from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire modifie le catalogue.",
  VALIDATION_FAILED:
    "Vérifiez la durée (au moins 1 minute), le prix, et le délai s'il s'agit d'une prestation à déposer (1 h à 90 jours).",
  RESOURCE_NOT_FOUND: "Cette prestation n'existe plus.",
};

/**
 * The performer list's refusals, kept apart from the catalogue's.
 *
 * <p>Both forms post to this page and the codes overlap, but one code does not
 * mean one thing: VALIDATION_FAILED on an offering is a duration or a price,
 * and here it is a name that is no longer on the team. A single map would have
 * to be vague enough to cover both, which helps nobody.
 */
const PERFORMER_REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire choisit qui réalise quoi.",
  VALIDATION_FAILED:
    "Un des noms cochés n'est plus dans votre équipe. Décochez-le, ou réactivez la personne depuis Équipe.",
  RESOURCE_NOT_FOUND: "Cette prestation n'existe plus.",
};

/** How many photographs one service carries, which the API enforces. */
const MAX_PHOTOS = 5;

/**
 * The photographs' refusals, kept apart from the other two for the same reason.
 *
 * <p>PHOTOS_FULL and the three that precede it are this client's own: the API
 * answers VALIDATION_FAILED to a full service and to a file that is not an
 * image, and a provider reading "cinq au maximum" wants that sentence and not
 * the code both cases share.
 */
const PHOTO_REFUSALS: Record<string, string> = {
  NO_FILE: "Choisissez une photo avant d'envoyer.",
  NOT_AN_IMAGE: "Seuls le JPEG et le PNG sont acceptés.",
  TOO_LARGE:
    "Cette photo dépasse 5 Mo. Renvoyez-la en plus petit — votre téléphone sait la réduire au partage.",
  PHOTOS_FULL:
    "Cette prestation porte déjà cinq photos, et cinq est le maximum. Retirez-en une pour faire de la place.",
  FORBIDDEN: "Seul le propriétaire modifie le catalogue.",
  VALIDATION_FAILED: "Ce fichier n'est pas une image que nous savons publier.",
  RESOURCE_NOT_FOUND: "Cette prestation n'existe plus.",
};

/** One of the three shapes a service can take, as the page draws it. */
type ServiceShape = {
  value: Fulfilment;
  label: string;
  icon: string;
  mode: string;
  desc: string;
};

/**
 * The shape a service falls back to.
 *
 * <p>Named rather than indexed because it is the answer to a question the
 * contract settles: a fulfilment this client does not know is an on-site
 * service, and that is what every service created before the enum grew is.
 */
const ON_SITE: ServiceShape = {
  value: "ON_SITE",
  label: "Sur place",
  icon: "mode-onsite",
  mode: "on-site",
  desc: "Le client vient et attend sur place.",
};

/**
 * The three shapes, as one control.
 *
 * <p>One control and not two. The API derives the shape from `turnaround_hours`
 * and `location`, refuses them together, and the only way a form can be sure
 * never to send that pair is never to offer them as two questions.
 */
const SHAPES: ServiceShape[] = [
  ON_SITE,
  {
    value: "DROP_OFF",
    label: "Dépôt",
    icon: "mode-dropoff",
    mode: "drop-off",
    desc: "Le client dépose et repasse. Le rendez-vous ne dure que la remise au comptoir.",
  },
  {
    value: "AT_CUSTOMER",
    label: "À domicile",
    icon: "mode-atcustomer",
    mode: "at-customer",
    desc: "Vous vous déplacez chez le client. L'adresse est jointe au rendez-vous.",
  },
];

/** The gap the mockup's panel stacks are built on. */
const PANEL_GAP = { "--stack-gap": "var(--s-6)" } as CSSProperties;

/**
 * The catalogue, and the one service being edited.
 *
 * <p>Two shapes on one route, because the API has one collection and the panels
 * that hang off a service are read by their own parameter. `?edit=` opens the
 * editor; `?performers=` and `?photos=` open it too, since that is where those
 * two actions send a provider back to, and landing on the list would hide the
 * refusal they need to read.
 *
 * <p>Nothing is deleted here, and the page says so: a retired service is kept
 * because appointments booked at its price still name it, and removing the row
 * would take that history with it. What looks like deletion is the switch
 * marked "Visible sur ma page", unticked.
 */
export default async function Services({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    edit?: string;
    performers?: string;
    performer_error?: string;
    photos?: string;
    photo_error?: string;
  }>;
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

  // Resolved against the catalogue rather than taken from the URL: an id naming
  // nothing then opens no panel, where reading it straight would answer 404 for
  // the whole page.
  const known = (id: string | undefined) =>
    services.data.some((s) => s.service_offering_id === id) ? id : undefined;

  const opened = known(query.performers);
  const openedPhotos = known(query.photos);
  const editedId = known(query.edit) ?? opened ?? openedPhotos;
  const edited = services.data.find((s) => s.service_offering_id === editedId);
  const creating = query.edit === "new";

  const roster = opened ? await rosterFor(opened) : null;
  // Sequential rather than parallel because the two are exclusive in practice:
  // each panel's link carries its own parameter and drops the other's.
  const album = openedPhotos
    ? await api<ServicePhotoList>(
        `/v1/service-offerings/${encodeURIComponent(openedPhotos)}/photos`,
      )
    : null;

  const refusal = query.error ? (
    <Notice tone="danger" title="L'enregistrement n'a pas abouti">
      {REFUSALS[query.error] ?? "Réessayez, ou rechargez la page."}
    </Notice>
  ) : null;

  if (creating || edited) {
    return (
      <Editor
        service={edited ?? null}
        currency={currency}
        refusal={refusal}
        performers={
          edited && opened === edited.service_offering_id && roster
            ? { roster, refusal: query.performer_error }
            : null
        }
        photos={
          edited && openedPhotos === edited.service_offering_id && album
            ? { album, refusal: query.photo_error }
            : null
        }
      />
    );
  }

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <div>
            <h1 className="appbar__title">Prestations</h1>
            <div className="appbar__sub">
              {live.length} en ligne · {services.data.length} au total
            </div>
          </div>
          <div className="appbar__actions">
            <Button
              label="Nouvelle prestation"
              variant="primary"
              size="sm"
              icon="plus"
              href="/dashboard/services?edit=new"
            />
          </div>
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          {refusal ? (
            <div style={{ marginBottom: "var(--s-6)" }}>{refusal}</div>
          ) : null}

          {services.data.length === 0 ? (
            <EmptyState
              sketch="notebook"
              title="Votre catalogue est encore vide"
              body="Ajoutez votre première prestation pour commencer à recevoir des réservations. Une seule suffit pour publier votre page."
              action={
                <Button
                  label="Ajouter une prestation"
                  variant="primary"
                  icon="plus"
                  href="/dashboard/services?edit=new"
                />
              }
            />
          ) : (
            <>
              <div className="panel">
                <div className="list" style={{ borderTop: 0 }}>
                  {services.data.map((service) => (
                    <Row key={service.service_offering_id} service={service} />
                  ))}
                </div>
              </div>
              <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
                Masquer une prestation la retire de votre page publique. Les
                rendez-vous déjà pris ne sont pas affectés et leur prix reste
                figé.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * One line of the catalogue.
 *
 * <p>No thumbnail and no photograph count, though the mockup draws both: the
 * collection carries neither, and there is one photograph list per offering -
 * so a picture per row would be a hundred requests on a page that reads a
 * hundred services in one.
 */
function Row({ service }: { service: ServiceOffering }) {
  const id = service.service_offering_id;
  const shape = SHAPES.find((s) => s.value === service.fulfilment) ?? ON_SITE;
  const buffer = service.buffer_before_minutes + service.buffer_after_minutes;
  const href = `/dashboard/services?edit=${encodeURIComponent(id)}`;

  return (
    <div className="list__item" style={{ alignItems: "flex-start" }}>
      <div className="grow">
        <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <Link href={href} className="t-strong" style={{ textDecoration: "none" }}>
            {service.name}
          </Link>
          {service.active ? null : (
            <Badge label="Masquée" tone="neutral" icon="eye-off" />
          )}
          {service.active && !service.price_visible ? (
            <Badge label="Prix masqué" tone="neutral" icon="eye-off" />
          ) : null}
        </div>
        <div
          className="row row--wrap"
          style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}
        >
          <span className={`mode mode--${shape.mode}`}>
            <Icon name={shape.icon} />
            {shape.label}
          </span>
          <span className="fact">
            <Icon name="clock" />
            {durationLabel(service.duration_minutes)}
          </span>
          {service.turnaround_hours ? (
            <span className="fact">
              <Icon name="hourglass" />
              Prêt sous {turnaroundLabel(service.turnaround_hours)}
            </span>
          ) : null}
          {buffer > 0 ? (
            <span className="fact">
              <Icon name="history" />+{buffer} min de battement
            </span>
          ) : null}
        </div>
      </div>
      <div className="row" style={{ gap: "var(--s-3)" }}>
        <span className="t-price">{money(service.price)}</span>
        <Button
          label="Modifier"
          variant="secondary"
          size="sm"
          icon="pencil"
          href={href}
        />
      </div>
    </div>
  );
}

/** "3 h", "2 h 30", "45 min" — a length as a provider says it out loud. */
function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

/** The promise a drop-off carries, in the unit the customer will read it in. */
function turnaroundLabel(hours: number): string {
  if (hours < 24 || hours % 24 !== 0) return `${hours} h`;
  const days = hours / 24;
  if (days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? "1 semaine" : `${weeks} semaines`;
  }
  return days === 1 ? "1 jour" : `${days} jours`;
}

/**
 * One service, whole.
 *
 * <p>Three forms and not one, because they post to three routes: the offering
 * is replaced whole, the performer list is replaced whole, and a photograph is
 * its own request carrying nothing but bytes. HTML forbids nesting them, so the
 * two panels the mockup draws inside the editor's form sit after it instead.
 *
 * <p>The photographs and the performers only appear once the service exists:
 * both hang off an identifier a creation does not have yet.
 */
function Editor({
  service,
  currency,
  refusal,
  performers,
  photos,
}: {
  service: ServiceOffering | null;
  currency: string;
  refusal: ReactNode;
  performers: { roster: Roster; refusal?: string } | null;
  photos: { album: ServicePhotoList; refusal?: string } | null;
}) {
  const id = service?.service_offering_id;

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <div>
            <h1 className="appbar__title">
              {service ? service.name : "Nouvelle prestation"}
            </h1>
            <div className="appbar__sub">
              {service ? "Modifier cette prestation" : "Ajouter au catalogue"}
            </div>
          </div>
          <div className="appbar__actions">
            <Button
              label="Retour"
              variant="ghost"
              size="sm"
              icon="arrow-left"
              href="/dashboard/services"
            />
          </div>
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          {refusal ? (
            <div style={{ marginBottom: "var(--s-6)" }}>{refusal}</div>
          ) : null}

          <div className="stack" style={PANEL_GAP}>
            <form
              action={service ? replaceService : createService}
              className="cols cols--main-aside"
            >
              {id ? <input type="hidden" name="id" value={id} /> : null}

              <div className="stack" style={PANEL_GAP}>
                <Essentials service={service} currency={currency} />
                <Shape service={service} />
                <Settings service={service} currency={currency} />

                <div
                  className="row row--wrap"
                  style={{ gap: "var(--s-3)", paddingTop: "var(--s-2)" }}
                >
                  <span className="grow" />
                  <Button label="Annuler" variant="ghost" href="/dashboard/services" />
                  <ActionButton
                    label={service ? "Enregistrer" : "Ajouter la prestation"}
                    variant="primary"
                    size="lg"
                    type="submit"
                  />
                </div>
              </div>

              <aside
                className="sticky-aside"
                style={{ display: "grid", gap: "var(--s-5)" }}
              >
                <Visibility service={service} />
              </aside>
            </form>

            {id ? (
              <>
                <Photos serviceId={id} opened={photos} />
                <Performers serviceId={id} opened={performers} />
              </>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * Name, description, price and length.
 *
 * <p>The price is a number field and not the mockup's spaced "150 000": what is
 * typed is posted as `amount_minor`, and a thousands separator would arrive as
 * something that is not a number at all.
 */
function Essentials({
  service,
  currency,
}: {
  service: ServiceOffering | null;
  currency: string;
}) {
  return (
    <div className="panel">
      <div className="panel__head">
        <div className="panel__title">L&rsquo;essentiel</div>
      </div>
      <div className="card__body">
        <div className="field">
          <label className="field__label" htmlFor="f-name">
            Nom
            <span className="field__req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            className="input"
            type="text"
            id="f-name"
            name="name"
            required
            maxLength={120}
            defaultValue={service?.name ?? ""}
            placeholder="Tresses collées, vidange, réparation d'écran…"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="f-description">
            Description
            <span className="field__optional">facultatif</span>
          </label>
          <textarea
            className="textarea"
            id="f-description"
            name="description"
            defaultValue={service?.description ?? ""}
          />
          <p className="field__hint">
            Dites ce qui est compris et ce qui ne l&rsquo;est pas. C&rsquo;est ce
            qui évite les malentendus.
          </p>
        </div>

        <div className="cols cols--2" style={{ gap: "var(--s-5)" }}>
          <div className="field">
            <label className="field__label" htmlFor="f-amount">
              Prix
              <span className="field__req" aria-hidden="true">
                *
              </span>
            </label>
            <div className="input-group input-group--suffix">
              <input
                className="input"
                type="number"
                id="f-amount"
                name="amount_minor"
                inputMode="numeric"
                required
                min={0}
                defaultValue={service?.price.amount_minor ?? 0}
              />
              <span className="input-group__suffix">
                {service?.price.currency ?? currency}
              </span>
            </div>
            <p className="field__hint">
              Modifier ce prix n&rsquo;affecte aucune réservation déjà prise.
            </p>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="f-duration">
              Durée du rendez-vous
              <span className="field__req" aria-hidden="true">
                *
              </span>
            </label>
            <div className="input-group input-group--suffix">
              <input
                className="input"
                type="number"
                id="f-duration"
                name="duration_minutes"
                inputMode="numeric"
                required
                min={1}
                max={720}
                defaultValue={service?.duration_minutes ?? 30}
              />
              <span className="input-group__suffix">min</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The one control that picks the shape, and the one field that follows from it.
 *
 * <p>The delay is shown only for a drop-off, which is the only shape that
 * carries one. It is not `required`: the panel is hidden for the other two, and
 * a hidden field a browser refuses to submit is a save that fails with nothing
 * on screen to explain it. An empty box on a drop-off arrives as a delay the
 * server refuses, and that refusal is a sentence this page prints.
 */
function Shape({ service }: { service: ServiceOffering | null }) {
  // Falling back also means no radio group ever renders with nothing checked.
  const shape: Fulfilment =
    SHAPES.find((s) => s.value === service?.fulfilment)?.value ?? ON_SITE.value;

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <div className="panel__title">Déroulement</div>
          <div className="panel__sub">
            Un seul mode par prestation&nbsp;: la base de données refuse toute
            combinaison.
          </div>
        </div>
      </div>
      <div className="card__body">
        <fieldset
          style={{ border: 0, padding: 0, margin: 0 }}
          data-reveal-group="fulfilment"
        >
          <legend className="sr-only">Mode de la prestation</legend>
          <div className="choice-grid choice-grid--3">
            {SHAPES.map((s) => (
              <label className="choice" key={s.value}>
                <input
                  type="radio"
                  name="fulfilment"
                  value={s.value}
                  defaultChecked={s.value === shape}
                />
                <span className="choice__mark">
                  <Icon name="check-circle" />
                </span>
                <span className="choice__head">
                  <span className="choice__icon">
                    <Icon name={s.icon} />
                  </span>
                  <span className="choice__title">{s.label}</span>
                </span>
                <span className="choice__desc">{s.desc}</span>
              </label>
            ))}
          </div>

          {/* Rendered already open when the stored shape is the drop-off, so
              the field is right on the first paint and reachable even if the
              presentation script never runs. */}
          <div
            data-reveal-when="DROP_OFF"
            hidden={shape !== "DROP_OFF"}
            style={{ marginTop: "var(--s-5)" }}
          >
            <div className="field">
              <label className="field__label" htmlFor="f-turnaround">
                Délai promis
                <span className="field__req" aria-hidden="true">
                  *
                </span>
              </label>
              <div className="input-group input-group--suffix">
                <input
                  className="input"
                  type="number"
                  id="f-turnaround"
                  name="turnaround_hours"
                  inputMode="numeric"
                  min={1}
                  max={2160}
                  defaultValue={service?.turnaround_hours ?? 48}
                />
                <span className="input-group__suffix">heures</span>
              </div>
              <p className="field__hint">
                Le client lit «&nbsp;Prêt sous 48&nbsp;h&nbsp;». La durée du
                rendez-vous ci-dessus ne représente que la remise au comptoir.
              </p>
            </div>
          </div>

          <div
            data-reveal-when="AT_CUSTOMER"
            hidden={shape !== "AT_CUSTOMER"}
            style={{ marginTop: "var(--s-5)" }}
          >
            <Notice title="Le client saisira son adresse">
              Commune, quartier et repères écrits. Aucune coordonnée GPS
              n&rsquo;est demandée ni conservée.
            </Notice>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

/**
 * What the customer never sees.
 *
 * <p>Absent from the mockup and kept anyway: the API replaces the whole
 * offering, so a buffer, an order or a currency this form left out would not be
 * a field kept, it would be a field cleared on the next save.
 */
function Settings({
  service,
  currency,
}: {
  service: ServiceOffering | null;
  currency: string;
}) {
  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <div className="panel__title">Réglages</div>
          <div className="panel__sub">Ce que le client ne voit pas.</div>
        </div>
      </div>
      <div className="card__body">
        <div className="cols cols--2" style={{ gap: "var(--s-5)" }}>
          <div className="field">
            <label className="field__label" htmlFor="f-buffer-before">
              Battement avant
            </label>
            <div className="input-group input-group--suffix">
              <input
                className="input"
                type="number"
                id="f-buffer-before"
                name="buffer_before_minutes"
                inputMode="numeric"
                min={0}
                max={240}
                defaultValue={service?.buffer_before_minutes ?? 0}
              />
              <span className="input-group__suffix">min</span>
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="f-buffer-after">
              Battement après
            </label>
            <div className="input-group input-group--suffix">
              <input
                className="input"
                type="number"
                id="f-buffer-after"
                name="buffer_after_minutes"
                inputMode="numeric"
                min={0}
                max={240}
                defaultValue={service?.buffer_after_minutes ?? 0}
              />
              <span className="input-group__suffix">min</span>
            </div>
          </div>
        </div>
        <p className="field__hint">
          Le temps de préparer et de ranger entre deux clients.
          L&rsquo;agenda le réserve sans le facturer.
        </p>

        <div
          className="cols cols--2"
          style={{ gap: "var(--s-5)", marginTop: "var(--s-5)" }}
        >
          <div className="field">
            <label className="field__label" htmlFor="f-currency">
              Monnaie
              <span className="field__req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              className="input"
              type="text"
              id="f-currency"
              name="currency"
              required
              pattern="[A-Z]{3}"
              maxLength={3}
              defaultValue={service?.price.currency ?? currency}
            />
            <p className="field__hint">
              Le code à trois lettres de la monnaie que vous facturez.
            </p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="f-sort">
              Ordre d&rsquo;affichage
            </label>
            <input
              className="input"
              type="number"
              id="f-sort"
              name="sort_order"
              inputMode="numeric"
              defaultValue={service?.sort_order ?? 0}
            />
            <p className="field__hint">
              Le plus petit passe en premier sur votre page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Whether the service is offered at all, and whether its price is shown. */
function Visibility({ service }: { service: ServiceOffering | null }) {
  return (
    <div className="panel">
      <div className="panel__head">
        <div className="panel__title">Visibilité</div>
      </div>
      <div className="card__body">
        <div className="stack" style={{ "--stack-gap": "var(--s-4)" } as CSSProperties}>
          <label className="switch" style={{ width: "100%" }}>
            <input
              type="checkbox"
              name="active"
              defaultChecked={service?.active ?? true}
            />
            <span className="switch__track" />
            <span className="grow">
              <span className="t-sm t-strong">Visible sur ma page</span>
              <span className="t-xs" style={{ display: "block" }}>
                Décocher la retire du public sans la supprimer. Les rendez-vous
                déjà pris portent encore son prix.
              </span>
            </span>
          </label>

          <label className="switch" style={{ width: "100%" }}>
            <input
              type="checkbox"
              name="price_visible"
              defaultChecked={service?.price_visible ?? true}
            />
            <span className="switch__track" />
            <span className="grow">
              <span className="t-sm t-strong">Afficher le prix</span>
              <span className="t-xs" style={{ display: "block" }}>
                Masqué, la prestation reste réservable et le client vous demande
                le prix.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * What the service looks like.
 *
 * <p>For braids, nails, a decorated hall or a buffet, the photograph IS the
 * specification: "tresses collées" names a family and not a style, and a
 * customer choosing between two of them is choosing between two pictures. A
 * service with none is a service described in words to people who came to look.
 *
 * <p>The slots do not renumber. The API takes the lowest free one on upload and
 * leaves a gap on removal, so the first photograph stays the first until its
 * owner removes it - and that is stated on the page, because a provider who
 * chose their opening picture should not find it changed by deleting another.
 */
function Photos({
  serviceId,
  opened,
}: {
  serviceId: string;
  opened: { album: ServicePhotoList; refusal?: string } | null;
}) {
  return (
    <div className="panel" id={`svc-${serviceId}`}>
      <div className="panel__head">
        <div>
          <div className="panel__title">Photos</div>
          <div className="panel__sub">
            5 au maximum · la première sert de vignette dans les listes
          </div>
        </div>
      </div>
      <div className="card__body">
        {opened ? (
          <Album serviceId={serviceId} album={opened.album} refusal={opened.refusal} />
        ) : (
          <>
            <p className="field__hint" style={{ marginTop: 0 }}>
              Cinq photos au maximum, et retirer l&rsquo;une d&rsquo;elles ne
              renumérote pas les autres&nbsp;: la place libérée est celle que
              reprendra la prochaine.
            </p>
            <div style={{ marginTop: "var(--s-4)" }}>
              <Button
                label="Voir les photos"
                variant="secondary"
                icon="image"
                href={`/dashboard/services?photos=${encodeURIComponent(serviceId)}#svc-${serviceId}`}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Album({
  serviceId,
  album,
  refusal,
}: {
  serviceId: string;
  album: ServicePhotoList;
  refusal?: string;
}) {
  const photos = album.data;
  const full = photos.length >= MAX_PHOTOS;

  return (
    <div className="stack" style={{ "--stack-gap": "var(--s-4)" } as CSSProperties}>
      {refusal ? (
        <Notice tone="danger" title="Les photos n'ont pas changé">
          {PHOTO_REFUSALS[refusal] ?? "Réessayez, ou rechargez la page."}
        </Notice>
      ) : null}

      {photos.length === 0 ? (
        <p className="field__hint" style={{ marginTop: 0 }}>
          Deux tresses ne se distinguent pas avec des mots. Une photo dit ce que
          trois lignes de description n&rsquo;arrivent pas à dire.
        </p>
      ) : null}

      <div className="photos">
        {photos.map((photo, rank) => (
          <div className="photo" key={photo.photo_id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(photo.url)}
              alt={`Photo ${photo.position + 1} de la prestation`}
            />
            <span className="photo__tag">
              {rank === 0 ? "Vignette" : `Place ${photo.position + 1}`}
            </span>
            <form action={removeServicePhoto}>
              <input type="hidden" name="id" value={serviceId} />
              <input type="hidden" name="photo_id" value={photo.photo_id} />
              <button
                className="photo__del"
                type="submit"
                aria-label={`Supprimer la photo ${photo.position + 1}`}
              >
                <Icon name="trash" size={16} />
              </button>
            </form>
          </div>
        ))}

        {/* The tile labels the input in the form below rather than wrapping it,
            which is what the mockup does: the preview replaces this tile's
            contents, and an input living inside would be replaced by the
            picture it produced - along with the file the upload was to send. */}
        {full ? null : (
          <label className="photo photo--add" id="photo-slot" htmlFor="photo-file">
            <Icon name="upload" />
            <span className="t-xs" style={{ fontWeight: 700 }}>
              Ajouter une photo
            </span>
          </label>
        )}
      </div>

      <p className="field__hint" style={{ marginTop: 0 }}>
        <Icon name="info" size={16} /> Cinq photos au maximum. La première
        représente la prestation dans les listes. Retirer une photo ne
        renumérote pas les autres&nbsp;: la place libérée est celle que
        reprendra la prochaine, et c&rsquo;est ainsi qu&rsquo;on change la photo
        de tête.
      </p>

      {full ? (
        <Notice title="Cinq photos, c'est le maximum">
          Retirez-en une pour en ajouter une autre.
        </Notice>
      ) : (
        <form action={addServicePhoto}>
          <input type="hidden" name="id" value={serviceId} />
          {/* Visible rather than hidden behind the tile: a label is not
              focusable, so an input clipped out of sight would leave somebody
              on a keyboard with a control they cannot see themselves reach. */}
          <input
            className="input"
            type="file"
            id="photo-file"
            name="image"
            accept="image/jpeg,image/png"
            required
            data-preview="photo-slot"
          />
          <p className="field__hint">
            JPEG ou PNG, 5&nbsp;Mo au maximum. Chaque photo est réduite à
            1600&nbsp;px sur son plus grand côté et ses métadonnées sont
            supprimées — y compris les coordonnées GPS qu&rsquo;un téléphone
            écrit dans une photo sans le demander. Elle n&rsquo;est envoyée
            qu&rsquo;au moment où vous appuyez sur le bouton.
          </p>
          <div style={{ marginTop: "var(--s-4)" }}>
            <ActionButton
              label="Envoyer cette photo"
              variant="secondary"
              type="submit"
              icon="upload"
            />
          </div>
        </form>
      )}
    </div>
  );
}

type Roster = { team: StaffList; performs: Set<string> };

/**
 * The team, and which of them perform one service.
 *
 * <p>One service at a time, and only when asked. The contract has one performer
 * list per offering, so reading them all would be a request per row on a page
 * that loads a hundred of them.
 */
async function rosterFor(serviceId: string): Promise<Roster> {
  const [team, performers] = await Promise.all([
    api<StaffList>("/v1/staff"),
    api<PerformerList>(
      `/v1/service-offerings/${encodeURIComponent(serviceId)}/performers`,
    ),
  ]);
  return { team, performs: new Set(performers.data.map((p) => p.staff_id)) };
}

/**
 * Who may take a booking for this service.
 *
 * <p>Presented as a removal, because that is what it is. A new service is
 * granted to the whole team, and competence is strict on the server - somebody
 * unticked here cannot be booked for it at all. So the list arrives full and
 * the only move it offers is taking a name out.
 */
function Performers({
  serviceId,
  opened,
}: {
  serviceId: string;
  opened: { roster: Roster; refusal?: string } | null;
}) {
  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <div className="panel__title">Qui réalise cette prestation</div>
          <div className="panel__sub">
            Détermine les créneaux proposés au client.
          </div>
        </div>
      </div>
      <div className="card__body">
        {opened ? (
          <Roll serviceId={serviceId} roster={opened.roster} refusal={opened.refusal} />
        ) : (
          <>
            <p className="field__hint" style={{ marginTop: 0 }}>
              Toute votre équipe la réalise. Ouvrez la liste pour en retirer
              quelqu&rsquo;un.
            </p>
            <div style={{ marginTop: "var(--s-4)" }}>
              <Button
                label="Voir la liste"
                variant="secondary"
                icon="users"
                href={`/dashboard/services?performers=${encodeURIComponent(serviceId)}`}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Roll({
  serviceId,
  roster,
  refusal,
}: {
  serviceId: string;
  roster: Roster;
  refusal?: string;
}) {
  const { team, performs } = roster;

  if (team.data.length === 0) {
    return (
      <EmptyState
        compact
        sketch="chair"
        title="Personne dans l'équipe"
        body="Qui réalise quoi se décide entre des personnes. Ajoutez-en d'abord une."
        action={
          <Button
            label="Composer l'équipe"
            variant="secondary"
            href="/dashboard/team"
            iconEnd="arrow-right"
          />
        }
      />
    );
  }

  return (
    <form
      action={replacePerformers}
      className="stack"
      style={{ "--stack-gap": "var(--s-4)" } as CSSProperties}
    >
      <input type="hidden" name="id" value={serviceId} />

      {refusal ? (
        <Notice tone="danger" title="La liste n'a pas été enregistrée">
          {PERFORMER_REFUSALS[refusal] ?? "Réessayez, ou rechargez la page."}
        </Notice>
      ) : null}

      <p className="field__hint" style={{ marginTop: 0 }}>
        <Icon name="info" size={16} /> Toute l&rsquo;équipe réalise une nouvelle
        prestation. Décochez qui ne la fait pas&nbsp;: cette personne ne pourra
        plus recevoir de réservation pour celle-ci. Tout décocher la rend
        irréservable.
      </p>

      {/* Everyone the team list returns, including someone who has left: the
          save sends the whole set, so a name this list did not draw is a name
          the save would quietly take away. Nobody is disabled here either -
          a box a browser will not submit is a competence removed in silence. */}
      <div className="stack" style={{ "--stack-gap": "var(--s-3)" } as CSSProperties}>
        {team.data.map((person) => (
          <label className="check" key={person.staff_id}>
            <input
              type="checkbox"
              name="staff_ids"
              value={person.staff_id}
              defaultChecked={performs.has(person.staff_id)}
            />
            <span className="check__box">
              <Icon name="check" />
            </span>
            <span className="check__text grow">
              <strong>{person.display_name}</strong>
              <span>{person.role}</span>
            </span>
            {person.active ? null : <Badge label="A quitté" tone="neutral" />}
            {person.active && !person.bookable ? (
              <Badge label="Non réservable" tone="neutral" />
            ) : null}
          </label>
        ))}
      </div>

      <div>
        <ActionButton
          label="Enregistrer la liste"
          variant="primary"
          type="submit"
          icon="check"
        />
      </div>
    </form>
  );
}
