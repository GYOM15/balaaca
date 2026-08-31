import { api } from "@/lib/api";
import { mediaUrl, money } from "@/lib/format";
import { Icon } from "@/components/icon";
import {
  ActionButton,
  Badge,
  Button,
  EmptyState,
  Notice,
  SectionHead,
} from "@/components/ui";
import type {
  Fulfilment,
  PerformerList,
  ServiceOffering,
  ServiceOfferingPage,
  ServicePhotoList,
  StaffList,
} from "@/lib/types";
// The one contract type this page needs that `@/lib/types` does not name yet.
// Read from the generated document rather than written out by hand, because a
// shape restated is a shape that can drift; it belongs in that file, one line,
// beside every other.
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

/**
 * The three shapes a service can take.
 *
 * <p>One control, not two. The API derives the shape from `turnaround_hours`
 * and `location`, refuses them together, and the only way a form can be sure
 * never to send that pair is never to offer them as two questions.
 */
const SHAPES: { value: Fulfilment; label: string; icon: string; hint: string }[] = [
  {
    value: "ON_SITE",
    label: "Sur place",
    icon: "store",
    hint: "Le client s'installe chez vous et repart avec. La durée est celle du travail.",
  },
  {
    value: "DROP_OFF",
    label: "À déposer",
    icon: "hourglass",
    hint: "Le client dépose et revient : garage, réparation, retouche. La durée est celle du passage au comptoir, pas celle de l'atelier.",
  },
  {
    value: "AT_CUSTOMER",
    label: "À domicile",
    icon: "map-pin",
    hint: "Vous vous déplacez : plomberie, électricité, ménage. Le rendez-vous portera l'adresse du client.",
  },
];

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
  searchParams: Promise<{
    error?: string;
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
  const opened = services.data.some((s) => s.service_offering_id === query.performers)
    ? query.performers
    : undefined;

  // The photographs are read the same way and for the same reason: there is one
  // list per offering and no bulk read, so drawing every album on this page
  // would be one request per row on a page that loads a hundred of them.
  const openedPhotos = services.data.some((s) => s.service_offering_id === query.photos)
    ? query.photos
    : undefined;

  const roster = opened ? await rosterFor(opened) : null;
  // Sequential rather than parallel because the two are exclusive in practice:
  // each panel's link carries its own parameter and drops the other's.
  const album = openedPhotos
    ? await api<ServicePhotoList>(
        `/v1/service-offerings/${encodeURIComponent(openedPhotos)}/photos`,
      )
    : null;

  return (
    <div className="stack stack-8">
      <header className="pro-head">
        <h1 className="pro-head__title">Prestations</h1>
        <p className="t-small t-muted">
          Ce que vos clients peuvent réserver — sur place, à déposer ou à
          domicile — avec la durée, le prix, et qui la réalise.
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
            {services.data.map((service) => {
              const id = service.service_offering_id;
              const shape = SHAPES.find((s) => s.value === service.fulfilment);
              return (
                // Open when it is the one whose performers are being read: the
                // link that loads them is a navigation, and a closed card would
                // hide what the visitor just asked for.
                <details
                  className="card card--pad svc-card"
                  key={id}
                  id={`svc-${id}`}
                  open={id === opened || id === openedPhotos}
                >
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
                        {service.turnaround_hours ? (
                          <>
                            {" · Prêt sous "}
                            <span className="tnum">{service.turnaround_hours}</span>
                            {" h"}
                          </>
                        ) : null}
                      </span>
                    </span>
                    {/* Only the two that change what a customer has to do. On
                        site is the ordinary case and needs no announcement. */}
                    {shape && shape.value !== "ON_SITE" ? (
                      <Badge label={shape.label} tone="info" icon={shape.icon} />
                    ) : null}
                    {service.active ? null : <Badge label="Retirée" tone="outline" />}
                    {service.active && !service.price_visible ? (
                      <Badge label="Prix masqué" tone="neutral" icon="eye-off" />
                    ) : null}
                  </summary>

                  <div className="stack stack-5" style={{ marginTop: "var(--space-4)" }}>
                    <form action={replaceService} className="stack stack-4">
                      <input type="hidden" name="id" value={id} />
                      <Fields service={service} currency={currency} />
                      <ActionButton label="Enregistrer" variant="primary" type="submit" icon="check" />
                    </form>

                    <hr />

                    {id === opened && roster ? (
                      <Performers
                        serviceId={id}
                        roster={roster}
                        refusal={query.performer_error}
                      />
                    ) : (
                      <div className="stack stack-2">
                        <p className="t-label">Qui réalise cette prestation</p>
                        <p className="field__hint">
                          Toute votre équipe la réalise. Ouvrez la liste pour en
                          retirer quelqu'un.
                        </p>
                        <Button
                          label="Voir la liste"
                          variant="secondary"
                          icon="users"
                          href={`/dashboard/services?performers=${encodeURIComponent(id)}#svc-${id}`}
                        />
                      </div>
                    )}

                    <hr />

                    {id === openedPhotos && album ? (
                      <Photos
                        serviceId={id}
                        album={album}
                        refusal={query.photo_error}
                      />
                    ) : (
                      <div className="stack stack-2">
                        <p className="t-label">Photos de la prestation</p>
                        <p className="field__hint">
                          Cinq au maximum. La première représente la prestation
                          dans les listes.
                        </p>
                        <Button
                          label="Voir les photos"
                          variant="secondary"
                          icon="image"
                          href={`/dashboard/services?photos=${encodeURIComponent(id)}#svc-${id}`}
                        />
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
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
 * The team, and which of them perform one service.
 *
 * <p>One service at a time, and only when asked. The contract has one performer
 * list per offering, so reading them all would be a request per row on a page
 * that loads a hundred of them.
 */
async function rosterFor(serviceId: string) {
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
  roster,
  refusal,
}: {
  serviceId: string;
  roster: { team: StaffList; performs: Set<string> };
  refusal?: string;
}) {
  const { team, performs } = roster;

  return (
    <section className="stack stack-3">
      <p className="t-label">Qui réalise cette prestation</p>

      {refusal ? (
        <Notice tone="danger" title="La liste n'a pas été enregistrée">
          {PERFORMER_REFUSALS[refusal] ?? "Réessayez, ou rechargez la page."}
        </Notice>
      ) : null}

      {team.data.length === 0 ? (
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
      ) : (
        <form action={replacePerformers} className="stack stack-3">
          <input type="hidden" name="id" value={serviceId} />
          <p className="field__hint">
            <Icon name="info" size={14} /> Toute l'équipe réalise une nouvelle
            prestation. Décochez qui ne la fait pas&nbsp;: cette personne ne
            pourra plus recevoir de réservation pour celle-ci. Tout décocher la
            rend irréservable.
          </p>

          {/* Everyone the team list returns, including someone who has left:
              the save sends the whole set, so a name this list did not draw is
              a name the save would quietly take away. */}
          <div className="stack stack-1">
            {team.data.map((person) => (
              <label className="checkbox" key={person.staff_id}>
                <input
                  type="checkbox"
                  name="staff_ids"
                  value={person.staff_id}
                  defaultChecked={performs.has(person.staff_id)}
                />
                <span className="checkbox__box">
                  <Icon name="check" size={14} />
                </span>
                <span className="grow row row-2 row--wrap">
                  <span className="t-small">{person.display_name}</span>
                  {person.active ? null : <Badge label="A quitté" tone="outline" />}
                  {person.active && !person.bookable ? (
                    <Badge label="Non réservable" tone="neutral" />
                  ) : null}
                </span>
              </label>
            ))}
          </div>

          <ActionButton
            label="Enregistrer la liste"
            variant="primary"
            type="submit"
            icon="check"
          />
        </form>
      )}
    </section>
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
    <section className="stack stack-3">
      <div className="row row--between row-3 row--wrap">
        <p className="t-label">Photos de la prestation</p>
        <span className="t-caption t-dim tnum">
          {photos.length} sur {MAX_PHOTOS}
        </span>
      </div>

      {refusal ? (
        <Notice tone="danger" title="Les photos n'ont pas changé">
          {PHOTO_REFUSALS[refusal] ?? "Réessayez, ou rechargez la page."}
        </Notice>
      ) : null}

      {photos.length === 0 ? (
        <EmptyState
          compact
          sketch="photographer"
          title="Aucune photo"
          body="Deux tresses ne se distinguent pas avec des mots. Une photo dit ce que trois lignes de description n'arrivent pas à dire."
        />
      ) : (
        <div className="row row-4 row--wrap row--top">
          {photos.map((photo) => (
            <form
              action={removeServicePhoto}
              className="stack stack-2"
              key={photo.photo_id}
            >
              <input type="hidden" name="id" value={serviceId} />
              <input type="hidden" name="photo_id" value={photo.photo_id} />
              {/* The box the monogram stands in elsewhere, so a row of
                  photographs lines up with the rest of the dashboard. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="avatar avatar--xl avatar--photo"
                src={mediaUrl(photo.url)}
                alt={`Photo ${photo.position + 1} de la prestation`}
                width={88}
                height={88}
              />
              {photo.position === 0 ? (
                <Badge label="La première" tone="brand" icon="star" />
              ) : (
                <span className="t-caption t-dim tnum">
                  Place {photo.position + 1}
                </span>
              )}
              <ActionButton
                label="Retirer"
                variant="quiet-danger"
                size="sm"
                type="submit"
                icon="trash"
              />
            </form>
          ))}
        </div>
      )}

      <p className="field__hint">
        <Icon name="info" size={14} /> Cinq au maximum. La première représente
        la prestation dans les listes. Retirer une photo ne renumérote pas les
        autres&nbsp;: la place libérée est celle que reprendra la suivante, et
        c'est ainsi qu'on change celle de tête.
      </p>

      {full ? (
        <Notice tone="info" title="Cinq photos, c'est le maximum">
          Retirez-en une pour en ajouter une autre.
        </Notice>
      ) : (
        <form action={addServicePhoto} className="stack stack-3">
          <input type="hidden" name="id" value={serviceId} />
          <label className="field">
            <span className="field__label">Ajouter une photo</span>
            <input
              className="input"
              type="file"
              name="image"
              accept="image/jpeg,image/png"
              required
            />
            <span className="field__hint">
              JPEG ou PNG, 5&nbsp;Mo au maximum. Les métadonnées sont retirées à
              l'envoi — y compris les coordonnées GPS qu'un téléphone écrit dans
              une photo sans le demander.
            </span>
          </label>
          <ActionButton
            label="Ajouter une photo"
            variant="secondary"
            type="submit"
            icon="plus"
          />
        </form>
      )}
    </section>
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
  // A fulfilment this client does not know is an on-site service - the contract
  // says so, and it is what every service created before the enum grew is.
  // Falling back also means no radio group ever renders with nothing checked.
  const shape: Fulfilment =
    SHAPES.find((s) => s.value === service?.fulfilment)?.value ?? "ON_SITE";

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
          placeholder="Tresses collées, vidange, réparation d'écran…"
        />
      </label>

      <label className="field">
        <span className="field__label">Description</span>
        <textarea
          className="textarea"
          name="description"
          rows={2}
          defaultValue={service?.description ?? ""}
          placeholder="Ce que le client doit savoir avant de réserver."
        />
      </label>

      <fieldset className="stack stack-2" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Comment ça se passe</legend>
        {SHAPES.map((s) => (
          <label className="choice" key={s.value}>
            <input
              type="radio"
              name="fulfilment"
              value={s.value}
              defaultChecked={s.value === shape}
            />
            <span className="grow">
              <span className="t-small">{s.label}</span>
              <span className="field__hint" style={{ display: "block" }}>
                {s.hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="field">
        <span className="field__label">
          Prêt sous (heures)<span className="field__req" aria-hidden="true">*</span>
        </span>
        {/* Required and pre-filled even though two of the three shapes ignore
            it: an empty box on a drop-off would arrive as no delay announced,
            which the server reads as an ordinary on-site service - the shape
            changing under a provider who picked the other one. */}
        <input
          className="input"
          type="number"
          name="turnaround_hours"
          required
          min={1}
          max={2160}
          defaultValue={service?.turnaround_hours ?? 48}
        />
        <span className="field__hint">
          <Icon name="info" size={14} /> Ce que vous annoncez au client qui
          dépose&nbsp;: «&nbsp;Prêt sous 48&nbsp;h&nbsp;». Sans effet sur une
          prestation sur place ou à domicile.
        </span>
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
        <Icon name="info" size={14} /> Le temps de préparer et de ranger entre
        deux clients. L'agenda le réserve sans le facturer.
      </p>

      <label className="switch">
        <input type="checkbox" name="price_visible" defaultChecked={service?.price_visible ?? true} />
        <span className="switch__track"><span className="switch__thumb" /></span>
        <span className="grow">
          <span className="t-small">Afficher le prix sur ma page</span>
          <span className="field__hint" style={{ display: "block" }}>
            Masqué, la prestation reste réservable et le client vous demande le prix.
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
