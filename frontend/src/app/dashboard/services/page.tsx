import Link from "next/link";
import type { CSSProperties } from "react";
import { api } from "@/lib/api";
import { mediaUrl, money } from "@/lib/format";
import { Icon, Scene } from "@/components/icon";
import type {
  Fulfilment,
  PerformerList,
  ServiceOffering,
  ServiceOfferingPage,
  ServicePhoto,
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
    "Vérifiez la durée (au moins 1 minute), le prix, et le délai s’il s’agit d’une prestation à déposer (1 h à 90 jours).",
  RESOURCE_NOT_FOUND: "Cette prestation n’existe plus.",
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
    "Un des noms cochés n’est plus dans votre équipe. Décochez-le, ou réactivez la personne depuis Équipe.",
  RESOURCE_NOT_FOUND: "Cette prestation n’existe plus.",
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
  NO_FILE: "Choisissez une photo avant d’envoyer.",
  NOT_AN_IMAGE: "Seuls le JPEG et le PNG sont acceptés.",
  TOO_LARGE:
    "Cette photo dépasse 5 Mo. Renvoyez-la en plus petit — votre téléphone sait la réduire au partage.",
  PHOTOS_FULL:
    "Cette prestation porte déjà cinq photos, et cinq est le maximum. Retirez-en une pour faire de la place.",
  FORBIDDEN: "Seul le propriétaire modifie le catalogue.",
  VALIDATION_FAILED: "Ce fichier n’est pas une image que nous savons publier.",
  RESOURCE_NOT_FOUND: "Cette prestation n’existe plus.",
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
    desc: "Vous vous déplacez chez le client. L’adresse est jointe au rendez-vous.",
  },
];

/** The gap the design's panel stacks are built on. */
const PANEL_GAP = { "--stack-gap": "var(--s-6)" } as CSSProperties;

/** The design writes this on every idle button icon rather than in the sheet. */
const ICON_IDLE: CSSProperties = { display: "inline-flex" };

/** The 64 px tile a catalogue row opens with. */
const THUMB: CSSProperties = {
  flex: "none",
  width: 64,
  height: 64,
  borderRadius: "var(--r-sm)",
  overflow: "hidden",
  background: "var(--bg-sunken)",
  display: "grid",
  placeItems: "center",
};

/**
 * The identifier the save button reaches back to.
 *
 * <p>The design draws the photographs and the team inside the offering's own
 * form, which HTML forbids: each of those posts to its own route and a form
 * cannot contain another. So the offering's form closes above them and its
 * submit - and the visibility switch, which lives in the aside - name it by
 * `form`, which is what that attribute is for. The panels keep the design's
 * order and every request keeps its own endpoint.
 */
const SERVICE_FORM = "f-service";

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
    created?: string;
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

  if (creating || edited) {
    // Two requests for one service, and only when the editor is open: the
    // design draws both panels filled, so neither is a click away.
    const [roster, album] = edited
      ? await Promise.all([
          rosterFor(edited.service_offering_id),
          api<ServicePhotoList>(
            `/v1/service-offerings/${encodeURIComponent(edited.service_offering_id)}/photos`,
          ),
        ])
      : [null, null];

    return (
      <Editor
        service={edited ?? null}
        currency={currency}
        refusal={query.error}
        roster={roster}
        performerRefusal={
          edited && opened === edited.service_offering_id ? query.performer_error : undefined
        }
        album={album}
        photoRefusal={
          edited && openedPhotos === edited.service_offering_id ? query.photo_error : undefined
        }
      />
    );
  }

  const created = services.data.find((s) => s.service_offering_id === query.created);

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <a
            className="btn btn--ghost btn--icon btn--sm hide-lg"
            href="#sections"
            aria-label="Menu"
          >
            <Icon name="menu" />
          </a>
          <div>
            <h1 className="appbar__title">Prestations</h1>
            <div className="appbar__sub">
              {live.length} actives · {services.data.length} au total
            </div>
          </div>
          <div className="appbar__actions">
            <Link className="btn btn--primary btn--sm" href="/dashboard/services?edit=new">
              <span className="btn__icon--idle" style={ICON_IDLE}>
                <Icon name="plus" size={18} />
              </span>
              <span className="btn__label--idle">Nouvelle prestation</span>
            </Link>
          </div>
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          {created ? (
            <div style={{ marginBottom: "var(--s-6)" }}>
              <div className="alert alert--success" role="status">
                <span className="alert__icon">
                  <Icon name="check-circle" />
                </span>
                <div className="grow">
                  <div className="alert__title">Prestation créée</div>
                  <div className="alert__body">
                    « {created.name} » est en ligne et réservable.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {query.error ? (
            <div style={{ marginBottom: "var(--s-6)" }}>
              <Refusal code={query.error} />
            </div>
          ) : null}

          {services.data.length === 0 ? (
            <div className="empty">
              <Scene name="notebook" className="scene-ill" />
              <div className="empty__title">Votre catalogue est encore vide</div>
              <p className="empty__body">
                Ajoutez votre première prestation pour commencer à recevoir des
                réservations. Une seule suffit pour publier votre page.
              </p>
              <div className="empty__actions">
                <Link className="btn btn--primary" href="/dashboard/services?edit=new">
                  <span className="btn__icon--idle" style={ICON_IDLE}>
                    <Icon name="plus" size={18} />
                  </span>
                  <span className="btn__label--idle">Ajouter une prestation</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="toolbar" style={{ marginBottom: "var(--s-5)" }}>
                <span className="segmented">
                  <Link className="segmented__item is-active" href="/dashboard/services">
                    Toutes ({services.data.length})
                  </Link>
                  <Link className="segmented__item" href="/dashboard/services">
                    Actives ({live.length})
                  </Link>
                  <Link className="segmented__item" href="/dashboard/services">
                    Masquées ({services.data.length - live.length})
                  </Link>
                </span>
              </div>

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
 * A refusal the server sent back, under the code that produced it.
 *
 * <p>The code travels on the element as well as in the sentence. The design
 * marks every refusal that way, and it is the one thing that tells a bug report
 * which branch of the server answered.
 */
function Refusal({
  code,
  title,
  sentences,
}: {
  code: string;
  title?: string;
  sentences?: Record<string, string>;
}) {
  const words = sentences ?? REFUSALS;
  return (
    <div className="alert alert--danger" role="alert" data-error-code={code}>
      <span className="alert__icon">
        <Icon name="alert-circle" />
      </span>
      <div className="grow">
        <div className="alert__title">
          {title ??
            (code === "VALIDATION_FAILED"
              ? "Certaines informations sont incomplètes"
              : "L’enregistrement n’a pas abouti")}
        </div>
        <div className="alert__body">
          {words[code] ?? "Réessayez, ou rechargez la page."}
        </div>
      </div>
    </div>
  );
}

/**
 * One line of the catalogue.
 *
 * <p>The tile opens empty on every row and the design's two remaining facts -
 * how many photographs, and who performs it - are not drawn at all. Both hang
 * off their own per-offering route, and a hundred services would be two hundred
 * requests for a list that reads in one. A count nobody counted is worse than
 * no count.
 */
function Row({ service }: { service: ServiceOffering }) {
  const id = service.service_offering_id;
  const shape = SHAPES.find((s) => s.value === service.fulfilment) ?? ON_SITE;
  const href = `/dashboard/services?edit=${encodeURIComponent(id)}`;

  return (
    <div className="list__item" style={{ alignItems: "flex-start" }}>
      <Link href={href} style={THUMB}>
        <Icon name="image" size={24} />
      </Link>
      <div className="grow">
        <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <Link href={href} className="t-strong" style={{ textDecoration: "none" }}>
            {service.name}
          </Link>
          {service.active ? null : (
            <span className="badge badge--neutral">
              <Icon name="eye-off" />
              Masquée
            </span>
          )}
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
        </div>
      </div>
      <div className="row" style={{ gap: "var(--s-3)" }}>
        <span className="t-price">{money(service.price)}</span>
        <Link className="btn btn--secondary btn--sm" href={href}>
          <span className="btn__icon--idle" style={ICON_IDLE}>
            <Icon name="pencil" size={18} />
          </span>
          <span className="btn__label--idle">Modifier</span>
        </Link>
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

/**
 * One service, whole.
 *
 * <p>Four panels in the design's order, then the two the aside carries. The
 * offering's own form closes after "Déroulement" so the photographs and the
 * team can keep their own forms - see {@link SERVICE_FORM}.
 *
 * <p>The photographs and the team only appear once the service exists: both
 * hang off an identifier a creation does not have yet.
 */
function Editor({
  service,
  currency,
  refusal,
  roster,
  performerRefusal,
  album,
  photoRefusal,
}: {
  service: ServiceOffering | null;
  currency: string;
  refusal?: string;
  roster: Roster | null;
  performerRefusal?: string;
  album: ServicePhotoList | null;
  photoRefusal?: string;
}) {
  const id = service?.service_offering_id;

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <a
            className="btn btn--ghost btn--icon btn--sm hide-lg"
            href="#sections"
            aria-label="Menu"
          >
            <Icon name="menu" />
          </a>
          <div>
            <h1 className="appbar__title">
              {service ? service.name : "Nouvelle prestation"}
            </h1>
            <div className="appbar__sub">
              {service
                ? "Modifier cette prestation"
                : "Elle sera visible dès son enregistrement"}
            </div>
          </div>
          <div className="appbar__actions">
            <Link className="btn btn--ghost btn--sm" href="/dashboard/services">
              <span className="btn__icon--idle" style={ICON_IDLE}>
                <Icon name="arrow-left" size={18} />
              </span>
              <span className="btn__label--idle">Retour</span>
            </Link>
          </div>
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          {refusal ? (
            <div style={{ marginBottom: "var(--s-6)" }}>
              <Refusal code={refusal} />
            </div>
          ) : null}

          <div className="cols cols--main-aside">
            <div className="stack" style={PANEL_GAP}>
              {/* The panels are stacked one level in rather than by the form
                  itself: React writes its own hidden fields as the form's first
                  children, and `.stack > * + *` would read them as a sibling
                  and push the first panel down by a gap nobody asked for. */}
              <form id={SERVICE_FORM} action={service ? replaceService : createService}>
                <div className="stack" style={PANEL_GAP}>
                  <Essentials service={service} currency={currency} />
                  <Shape service={service} />
                </div>

                {/* The API replaces the offering whole, so a field this form
                    leaves out is a field the next save clears. The design has
                    no panel for these five, and they are not the provider's to
                    lose because of that - they ride along as they stand. */}
                {id ? <input type="hidden" name="id" value={id} /> : null}
                <input
                  type="hidden"
                  name="buffer_before_minutes"
                  value={service?.buffer_before_minutes ?? 0}
                />
                <input
                  type="hidden"
                  name="buffer_after_minutes"
                  value={service?.buffer_after_minutes ?? 0}
                />
                <input
                  type="hidden"
                  name="currency"
                  value={service?.price.currency ?? currency}
                />
                <input type="hidden" name="sort_order" value={service?.sort_order ?? 0} />
                {(service?.price_visible ?? true) ? (
                  <input type="hidden" name="price_visible" value="on" />
                ) : null}
              </form>

              {id && album ? (
                <Photos serviceId={id} album={album} refusal={photoRefusal} />
              ) : null}
              {id && roster ? (
                <Performers serviceId={id} roster={roster} refusal={performerRefusal} />
              ) : null}

              <div
                className="row row--wrap"
                style={{ gap: "var(--s-3)", paddingTop: "var(--s-2)" }}
              >
                <span className="grow" />
                <Link className="btn btn--ghost" href="/dashboard/services">
                  <span className="btn__label--idle">Annuler</span>
                </Link>
                <button className="btn btn--primary btn--lg" type="submit" form={SERVICE_FORM}>
                  <span className="btn__label--idle">
                    {service ? "Enregistrer" : "Créer la prestation"}
                  </span>
                  <span className="btn__icon--busy">
                    <Icon name="loader" size={18} className="ico--spin" />
                  </span>
                  <span className="btn__label--busy">Enregistrement…</span>
                  <span className="btn__icon--done">
                    <Icon name="check" size={18} />
                  </span>
                  <span className="btn__label--done">Enregistré</span>
                </button>
              </div>
            </div>

            <aside className="sticky-aside" style={{ display: "grid", gap: "var(--s-5)" }}>
              <Preview service={service} album={album} />
              <Visibility service={service} />
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * Name, description, price and length.
 *
 * <p>The price is a number field and not the design's spaced "150 000": what is
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
        <div className="panel__title">L’essentiel</div>
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
            defaultValue={service?.name ?? ""}
            placeholder="Tresses collées (cornrows)"
            required
            maxLength={120}
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
            Dites ce qui est compris et ce qui ne l’est pas. C’est ce qui évite
            les malentendus.
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
                defaultValue={service?.price.amount_minor ?? ""}
              />
              <span className="input-group__suffix">
                {service?.price.currency ?? currency}
              </span>
            </div>
            <p className="field__hint">
              Modifier ce prix n’affecte aucune réservation déjà prise.
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
                defaultValue={service?.duration_minutes ?? ""}
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
            Un seul mode par prestation : la base de données refuse toute
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
                Le client lit « Prêt sous 48 h ». La durée du rendez-vous
                ci-dessus ne représente que la remise au comptoir.
              </p>
            </div>
          </div>

          <div
            data-reveal-when="AT_CUSTOMER"
            hidden={shape !== "AT_CUSTOMER"}
            style={{ marginTop: "var(--s-5)" }}
          >
            <div className="alert alert--info" role="status">
              <span className="alert__icon">
                <Icon name="info" />
              </span>
              <div className="grow">
                <div className="alert__title">Le client saisira son adresse</div>
                <div className="alert__body">
                  Commune, quartier et repères écrits. Aucune coordonnée GPS
                  n’est demandée ni conservée.
                </div>
              </div>
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

/**
 * What the service looks like.
 *
 * <p>For braids, nails, a decorated hall or a buffet, the photograph IS the
 * specification: "tresses collées" names a family and not a style, and a
 * customer choosing between two of them is choosing between two pictures.
 *
 * <p>The slots do not renumber. The API takes the lowest free one on upload and
 * leaves a gap on removal, so the first photograph stays the first until its
 * owner removes it - and that is stated on the page, because a provider who
 * chose their opening picture should not find it changed by deleting another.
 */
function Photos({
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
    <div className="panel" id={`svc-${serviceId}`}>
      <div className="panel__head">
        <div>
          <div className="panel__title">Photos</div>
          <div className="panel__sub">
            5 maximum · la première sert de vignette dans les listes
          </div>
        </div>
      </div>
      <div className="card__body">
        {refusal ? (
          <div style={{ marginBottom: "var(--s-4)" }}>
            <Refusal
              code={refusal}
              title="Les photos n’ont pas changé"
              sentences={PHOTO_REFUSALS}
            />
          </div>
        ) : null}

        <div className="photos">
          {photos.map((photo, rank) => (
            <Photo key={photo.photo_id} serviceId={serviceId} photo={photo} rank={rank} />
          ))}

          {/* The tile labels the input in the form below rather than wrapping
              it, which is what the design does: the preview replaces this
              tile's contents, and an input living inside would be replaced by
              the picture it produced - along with the file it was to send. */}
          {full ? null : (
            <label className="photo photo--add" id="photo-slot" htmlFor="photo-file">
              <Icon name="upload" />
              <span className="t-xs" style={{ fontWeight: 700 }}>
                Ajouter
              </span>
            </label>
          )}
        </div>

        <p className="field__hint" style={{ marginTop: "var(--s-4)" }}>
          JPEG ou PNG, 5 Mo maximum. Chaque photo est réduite à 1600 px sur son
          plus grand côté et ses métadonnées sont supprimées.
        </p>
        <p
          className="t-xs"
          style={{ marginTop: "var(--s-2)", color: "var(--text-tertiary)" }}
        >
          <Icon name="info" size={16} /> Cinq photos au maximum. Retirer l’une
          d’elles ne renumérote pas les autres : chacune garde sa place, et
          celle qui se libère est la place que reprendra la prochaine.
        </p>

        {full ? (
          <div style={{ marginTop: "var(--s-4)" }}>
            <div className="alert alert--info" role="status">
              <span className="alert__icon">
                <Icon name="info" />
              </span>
              <div className="grow">
                <div className="alert__title">Cinq photos, c’est le maximum</div>
                <div className="alert__body">
                  Retirez-en une pour en ajouter une autre.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form action={addServicePhoto} style={{ marginTop: "var(--s-4)" }}>
            <input type="hidden" name="id" value={serviceId} />
            <input
              className="sr-only"
              type="file"
              id="photo-file"
              name="image"
              accept="image/jpeg,image/png"
              required
              data-preview="photo-slot"
            />
            <button className="btn btn--secondary" type="submit">
              <span className="btn__icon--idle" style={ICON_IDLE}>
                <Icon name="upload" size={18} />
              </span>
              <span className="btn__label--idle">Envoyer cette photo</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * One photograph, and the question asked before it goes.
 *
 * <p>The button carries no `type`, so it submits: with the presentation script
 * it opens the dialogue first, and without it the removal still happens. What
 * it does not carry is `data-optimistic` or `data-dialog-close`, both of which
 * call `preventDefault` - on a real submit that is a button that does nothing.
 */
function Photo({
  serviceId,
  photo,
  rank,
}: {
  serviceId: string;
  photo: ServicePhoto;
  rank: number;
}) {
  const dialog = `dlg-photo-${photo.photo_id}`;

  return (
    <div className="photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(photo.url)} alt={`Photo ${photo.position + 1}`} />
      {rank === 0 ? <span className="photo__tag">Vignette</span> : null}
      <form action={removeServicePhoto}>
        <input type="hidden" name="id" value={serviceId} />
        <input type="hidden" name="photo_id" value={photo.photo_id} />
        <button
          className="photo__del"
          type="submit"
          aria-label={`Supprimer la photo ${photo.position + 1}`}
          data-dialog-open={dialog}
        >
          <Icon name="trash" size={16} />
        </button>

        <dialog className="dialog" id={dialog}>
          <div className="dialog__inner">
            <div className="dialog__head">
              <h2 className="dialog__title">Supprimer cette photo&nbsp;?</h2>
            </div>
            <div className="dialog__body">
              <p>
                {rank === 0
                  ? "C’est la vignette actuelle. La photo suivante prendra sa place dans les listes."
                  : "Les autres photos gardent leur place : celle-ci se libère, et c’est elle que reprendra la prochaine."}
              </p>
            </div>
            <div className="dialog__foot">
              <button className="btn btn--secondary" type="button" data-dialog-close>
                <span className="btn__label--idle">Garder</span>
              </button>
              <button className="btn btn--danger" type="submit">
                <span className="btn__label--idle">Supprimer</span>
              </button>
            </div>
          </div>
        </dialog>
      </form>
    </div>
  );
}

type Roster = { team: StaffList; performs: Set<string> };

/**
 * The team, and which of them perform one service.
 *
 * <p>One service at a time. The contract has one performer list per offering,
 * so reading them all would be a request per row on a page that loads a hundred
 * of them.
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
 * <p>Nobody is disabled here, though the design draws the unbookable one that
 * way: the save sends the whole set, so a box a browser will not submit is a
 * competence removed in silence.
 */
function Performers({
  serviceId,
  roster,
  refusal,
}: {
  serviceId: string;
  roster: Roster;
  refusal?: string;
}) {
  const { team, performs } = roster;

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
        {team.data.length === 0 ? (
          <div className="empty empty--tight">
            <Scene name="chair" className="scene-ill" />
            <div className="empty__title">Personne dans l’équipe</div>
            <p className="empty__body">
              Qui réalise quoi se décide entre des personnes. Ajoutez-en d’abord
              une.
            </p>
            <div className="empty__actions">
              <Link className="btn btn--secondary" href="/dashboard/team">
                <span className="btn__label--idle">Composer l’équipe</span>
                <span className="btn__icon--idle" style={ICON_IDLE}>
                  <Icon name="arrow-right" size={18} />
                </span>
              </Link>
            </div>
          </div>
        ) : (
          <form action={replacePerformers}>
            <input type="hidden" name="id" value={serviceId} />

            {refusal ? (
              <div style={{ marginBottom: "var(--s-4)" }}>
                <Refusal
                  code={refusal}
                  title="La liste n’a pas été enregistrée"
                  sentences={PERFORMER_REFUSALS}
                />
              </div>
            ) : null}

            {/* Everyone the team list returns, including someone who has left:
                the save sends the whole set, so a name this list did not draw
                is a name the save would quietly take away. */}
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
                  {person.bookable ? null : (
                    <span className="badge badge--neutral">Non réservable</span>
                  )}
                </label>
              ))}
            </div>

            <div style={{ marginTop: "var(--s-5)" }}>
              <button className="btn btn--secondary" type="submit">
                <span className="btn__icon--idle" style={ICON_IDLE}>
                  <Icon name="check" size={18} />
                </span>
                <span className="btn__label--idle">Enregistrer la liste</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * What a visitor will see.
 *
 * <p>The stored service and not the one being typed: this is rendered on the
 * server, and a preview that followed the keyboard would be the one piece of
 * this screen that needed a script.
 */
function Preview({
  service,
  album,
}: {
  service: ServiceOffering | null;
  album: ServicePhotoList | null;
}) {
  const shape = SHAPES.find((s) => s.value === service?.fulfilment) ?? ON_SITE;
  const cover = album?.data[0];

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <div className="panel__title">Aperçu client</div>
          <div className="panel__sub">Ce que verra un visiteur</div>
        </div>
      </div>
      <div className="card__body">
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            overflow: "hidden",
          }}
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl(cover.url)}
              alt=""
              style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }}
            />
          ) : null}
          <div style={{ padding: "var(--s-4)" }}>
            <div className="t-strong">{service ? service.name : "Nom de la prestation"}</div>
            <div
              className="row row--wrap"
              style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}
            >
              <span className={`mode mode--${shape.mode}`}>
                <Icon name={shape.icon} />
                {shape.label}
              </span>
              {service ? (
                <span className="fact">
                  <Icon name="clock" />
                  {durationLabel(service.duration_minutes)}
                </span>
              ) : null}
            </div>
            <div className="row row--between" style={{ marginTop: "var(--s-4)" }}>
              {/* A price the provider chose to hide is a price the visitor does
                  not get, and this panel says what the visitor gets. */}
              <span className="t-price">
                {service && service.price_visible ? money(service.price) : "·"}
              </span>
              <span className="btn btn--primary btn--sm">Réserver</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Whether the service is offered at all. */
function Visibility({ service }: { service: ServiceOffering | null }) {
  return (
    <div className="panel">
      <div className="panel__head">
        <div className="panel__title">Visibilité</div>
      </div>
      <div className="card__body">
        <label className="switch" style={{ width: "100%" }}>
          <input
            type="checkbox"
            name="active"
            form={SERVICE_FORM}
            defaultChecked={service?.active ?? true}
          />
          <span className="switch__track" />
          <span className="grow">
            <span className="t-sm t-strong">Visible sur ma page</span>
            <span className="t-xs" style={{ display: "block" }}>
              Décocher la retire du public sans la supprimer.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
