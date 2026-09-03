import Link from "next/link";
import { api } from "@/lib/api";
import { dateTime, mediaUrl } from "@/lib/format";
import { Icon } from "@/components/icon";
import { Notice, initials } from "@/components/ui";
import type {
  AreaList,
  BookingPolicy,
  LocalityList,
  ProviderProfile,
  ReadinessView,
} from "@/lib/types";
import { groupLocalities, localityLabel } from "@/lib/localities";
import {
  saveProfile,
  savePolicy,
  setPublished,
  uploadCover,
  uploadLogo,
} from "./actions";

export const dynamic = "force-dynamic";

/** Proxied through this server, because the browser cannot reach the API. */
const QR_CODE = "/dashboard/profile/qr-code";

/**
 * The two boxes the island fills with the chosen file, and the two inputs that
 * choose it.
 *
 * <p>They are named apart because they must be apart. Section 6 of
 * presentation-script.ts replaces the preview element's `innerHTML`, so an
 * input sitting inside one is destroyed - with the file it was holding - before
 * the form it belongs to can send anything. The services screen learned that
 * first; here `.pcover::after` adds a second reason, having measured as
 * `pointer-events: auto` across the whole band.
 */
const COVER_PREVIEW = "cover-preview";
const COVER_INPUT = "cover-file";
const LOGO_PREVIEW = "logo-preview";
const LOGO_INPUT = "logo-file";

/**
 * What the publish switch actually activates.
 *
 * <p>A checkbox cannot submit its form without JavaScript, and a submit button
 * cannot be `:checked` - which is what the design's track is drawn from. So the
 * switch is a `label` for this control, and the checkbox it contains carries no
 * name and exists only to light the track. A label's `for` beats a control
 * nested inside it, so clicking anywhere on the switch reaches this and the
 * page saves itself.
 */
const PUBLISH_SUBMIT = "publish-submit";

/** `.btn__icon--idle` has no display of its own; only its two siblings do. */
const ICON_IDLE = { display: "inline-flex" } as const;

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire modifie la page et les réglages.",
  // The API sends INVALID_STATE_TRANSITION here, not a code of its own. This
  // key used to be NOTHING_TO_PUBLISH, which the catalogue does not publish -
  // so every refusal to publish fell through to the generic sentence while a
  // useful one sat unreachable on this line.
  INVALID_STATE_TRANSITION:
    "Il faut au moins une prestation, des horaires et quelqu’un de réservable avant de publier.",
  VALIDATION_FAILED:
    "Vérifiez la commune et le numéro de téléphone (format +224…).",
  NO_FILE: "Choisissez un fichier avant d’envoyer.",
  NOT_AN_IMAGE: "Seuls le JPEG et le PNG sont acceptés.",
  UNKNOWN: "L’enregistrement n’a pas abouti.",
};

/** The stack's gap, written the way the design writes it. */
const gap = (value: string) => ({ "--stack-gap": value }) as React.CSSProperties;

export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const [profile, readiness, policy, localities, areas] = await Promise.all([
    api<ProviderProfile>("/v1/provider-profile"),
    api<ReadinessView>("/v1/provider-profile/readiness"),
    api<BookingPolicy>("/v1/booking-policy"),
    api<LocalityList>("/v1/localities"),
    // Every quartier already written, not only those of this provider's own
    // commune: the form has no JavaScript, so the list cannot follow a change
    // of commune, and suggesting nothing after a move would be worse than
    // suggesting a few too many.
    api<AreaList>("/v1/areas"),
  ]);

  const logo = mediaUrl(profile.logo_url);
  const cover = mediaUrl(profile.cover_url);
  const address = profile.public_url?.replace(/^https?:\/\//, "") ?? `/p/${profile.slug}`;

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
            <h1 className="appbar__title">Ma page</h1>
            <div className="appbar__sub">
              {profile.suspended_at
                ? "Retirée de l’annuaire"
                : profile.published
                  ? `En ligne · ${address}`
                  : "Brouillon · non publiée"}
            </div>
          </div>
          <div className="appbar__actions">
            <Link className="btn btn--secondary btn--sm" href={`/p/${profile.slug}`}>
              <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                <Icon name="external" size={18} />
              </span>
              <span className="btn__label--idle">Voir en public</span>
            </Link>
          </div>
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          {/* Before anything else, and before the save box: a provider whose
              page has vanished is looking for this and nothing else. */}
          {profile.suspended_at ? (
            <div style={{ marginBottom: "var(--s-6)" }}>
              <Notice
                tone="danger"
                title="Votre page est retirée de l’annuaire"
                icon="ban"
                actions={
                  <Link className="btn btn--danger btn--sm" href="/dashboard/contestation">
                    <span className="btn__label--idle">Comprendre et répondre</span>
                  </Link>
                }
              >
                Depuis le {dateTime(profile.suspended_at, profile.timezone)}, elle
                n’apparaît plus dans l’annuaire et vos clients ne peuvent plus
                l’ouvrir, même avec le lien.{" "}
                {profile.suspension_reason
                  ? `Motif : ${profile.suspension_reason}`
                  : "Aucun motif n’a été communiqué."}{" "}
                Vos rendez-vous déjà pris restent dans votre agenda. C’est la
                plateforme qui remet la page en ligne&nbsp;: la republier
                vous-même n’y change rien.
              </Notice>
            </div>
          ) : null}

          {query.error ? (
            <div style={{ marginBottom: "var(--s-6)" }}>
              <Notice tone="danger" title="La modification n’a pas abouti">
                {REFUSALS[query.error] ?? REFUSALS.UNKNOWN}
              </Notice>
            </div>
          ) : null}

          <div className="cols cols--main-aside">
            <div className="stack" style={gap("var(--s-6)")}>
              {/* --- The images --- */}
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Bandeau et logo</div>
                    <div className="panel__sub">Ce que l’on voit en premier</div>
                  </div>
                </div>
                <div className="card__body">
                  <form action={uploadCover}>
                    {/* The band a visitor gets, drawn by the class that draws
                        it there, rather than by a ratio written on this line.
                        Same height to the pixel - the design gives a cover
                        `clamp(160px, 26vw, 300px)` - and the panel is narrower
                        than a page, so what this shows is the tighter of the
                        two crops. That is the safe direction to be wrong in,
                        and it is as close as markup gets while the height is
                        measured against the window and the width against
                        this column. */}
                    <div className="pcover atmo grain grain--dark" id={COVER_PREVIEW}>
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="Bandeau actuel" width={1600} height={500} />
                      ) : null}
                    </div>
                    {cover ? null : (
                      <p className="t-xs" style={{ marginTop: "var(--s-2)" }}>
                        Sans bandeau, votre page ouvre sur ce fond.
                      </p>
                    )}
                    <div
                      className="row row--wrap"
                      style={{ marginTop: "var(--s-3)", gap: "var(--s-3)" }}
                    >
                      {/* Outside the box above, and that is the whole trick:
                          the island empties that box to show the choice, and
                          an input standing in it goes with the contents. */}
                      <label className="btn btn--secondary btn--sm" htmlFor={COVER_INPUT}>
                        <span className="btn__icon--idle" style={ICON_IDLE}>
                          <Icon name="camera" size={18} />
                        </span>
                        <span className="btn__label--idle">Choisir un bandeau</span>
                      </label>
                      <input
                        className="sr-only"
                        type="file"
                        id={COVER_INPUT}
                        name="image"
                        accept="image/jpeg,image/png"
                        data-preview={COVER_PREVIEW}
                      />
                      {/* Four labels, and NOT a progress bar: a figure that
                          means anything needs the upload to report itself,
                          which needs XHR and a client component, and this page
                          is neither. Two of the four are also dead for now -
                          `data-busy` is what the stylesheet swaps them on, and
                          nothing in the shipped island sets it on a form that
                          really submits. They are written the way every other
                          screen writes them, so the day something does, this
                          says so too. What a provider is actually owed - that
                          the bytes arrived, and which image they were - the
                          action says when it lands. */}
                      <button className="btn btn--primary btn--sm" type="submit">
                        <span className="btn__icon--idle" style={ICON_IDLE}>
                          <Icon name="upload" size={18} />
                        </span>
                        <span className="btn__label--idle">Enregistrer le bandeau</span>
                        <span className="btn__icon--busy">
                          <Icon name="loader" size={18} className="ico--spin" />
                        </span>
                        <span className="btn__label--busy">Envoi du bandeau…</span>
                        <span className="btn__icon--done">
                          <Icon name="check" size={18} />
                        </span>
                        <span className="btn__label--done">Bandeau enregistré</span>
                      </button>
                    </div>
                  </form>

                  <form action={uploadLogo}>
                    <div className="row" style={{ marginTop: "var(--s-5)", gap: "var(--s-4)" }}>
                      {/* The slot the public page gives a logo, and not the
                          round `.avatar`: that one crops to a circle, so a
                          provider was judging their logo by a cut no customer
                          will ever see. The margin below it pays for the phone
                          layout, where this box stacks above the card. The
                          position is what keeps the island's preview furniture
                          in the box: it is absolute, and this slot is the one
                          preview target the design leaves unpositioned, so
                          without this the "Envoi…" tag lands in the top-left
                          corner of the window - measured, not feared. */}
                      <div
                        className="phead__logo"
                        id={LOGO_PREVIEW}
                        style={{ marginBottom: 0, position: "relative" }}
                      >
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt="Logo actuel" width={88} height={88} />
                        ) : (
                          <span className="avatar avatar--xl" aria-hidden="true">
                            {initials(profile.business_name)}
                          </span>
                        )}
                      </div>
                      <div className="grow">
                        <div className="t-strong">Logo</div>
                        <p className="t-xs" style={{ marginTop: 2 }}>
                          Carré, JPEG ou PNG, 5 Mo maximum. Il n’est pas
                          rogné&nbsp;: une image large s’affiche large.
                        </p>
                        <div
                          className="row row--wrap"
                          style={{ marginTop: "var(--s-3)", gap: "var(--s-2)" }}
                        >
                          <label className="btn btn--secondary btn--sm" htmlFor={LOGO_INPUT}>
                            <span className="btn__icon--idle" style={ICON_IDLE}>
                              <Icon name="upload" size={18} />
                            </span>
                            <span className="btn__label--idle">Choisir un logo</span>
                          </label>
                          <input
                            className="sr-only"
                            type="file"
                            id={LOGO_INPUT}
                            name="image"
                            accept="image/jpeg,image/png"
                            data-preview={LOGO_PREVIEW}
                          />
                          <button className="btn btn--primary btn--sm" type="submit">
                            <span className="btn__icon--idle" style={ICON_IDLE}>
                              <Icon name="upload" size={18} />
                            </span>
                            <span className="btn__label--idle">Enregistrer le logo</span>
                            <span className="btn__icon--busy">
                              <Icon name="loader" size={18} className="ico--spin" />
                            </span>
                            <span className="btn__label--busy">Envoi du logo…</span>
                            <span className="btn__icon--done">
                              <Icon name="check" size={18} />
                            </span>
                            <span className="btn__label--done">Logo enregistré</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              {/* --- The profile --- */}
              <div className="panel">
                <div className="panel__head">
                  <div className="panel__title">Informations publiques</div>
                </div>
                <form action={saveProfile}>
                  <div className="card__body">
                    {/* The API replaces the profile whole, so what this screen
                        does not draw travels with it as it stands. Dropping any
                        of these from the body would clear the column on the
                        next save: `city` still feeds the directory card, the
                        trade decides which trade page carries this business,
                        and a blank timezone is not a timezone at all.
                        `published` is the one that would cost the most - the
                        switch is its own form now, and without this line a
                        corrected address would take a live page offline. */}
                    <input
                      type="hidden"
                      name="published"
                      value={profile.published ? "on" : ""}
                    />
                    <input type="hidden" name="city" value={profile.city ?? ""} />
                    <input
                      type="hidden"
                      name="category_slug"
                      value={profile.category_slug ?? ""}
                    />
                    <input
                      type="hidden"
                      name="public_phone_e164"
                      value={profile.public_phone_e164 ?? ""}
                    />
                    <input
                      type="hidden"
                      name="public_email"
                      value={profile.public_email ?? ""}
                    />
                    <input type="hidden" name="timezone" value={profile.timezone} />

                    <div className="field">
                      <label className="field__label" htmlFor="p-name">
                        Nom de l’établissement
                        <span className="field__req" aria-hidden="true">
                          *
                        </span>
                      </label>
                      <input
                        className="input"
                        type="text"
                        id="p-name"
                        name="business_name"
                        required
                        maxLength={120}
                        defaultValue={profile.business_name}
                      />
                    </div>

                    <div className="field">
                      <label className="field__label" htmlFor="p-about">
                        Présentation
                        <span className="field__optional">facultatif</span>
                      </label>
                      <textarea
                        className="textarea"
                        id="p-about"
                        name="description"
                        maxLength={2000}
                        style={{ minHeight: 120 }}
                        defaultValue={profile.description ?? ""}
                      />
                    </div>

                    <div className="cols cols--2" style={{ gap: "var(--s-5)" }}>
                      <div className="field">
                        <label className="field__label" htmlFor="p-locality">
                          Commune
                        </label>
                        <select
                          className="select"
                          id="p-locality"
                          name="locality_slug"
                          defaultValue={profile.locality?.slug ?? ""}
                        >
                          <option value="">Partout en Guinée</option>
                          {groupLocalities(localities.data).map(({ region, children }) => (
                            <optgroup key={region.slug} label={region.label_fr}>
                              {children.map((l) => (
                                <option key={l.slug} value={l.slug}>
                                  {localityLabel(l)}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="p-area">
                          Quartier
                        </label>
                        {/* Free text with suggestions, because the server takes
                            it that way: Guinea's quartiers are thousands of
                            names this platform does not write, and a closed
                            list would be missing exactly the one this provider
                            works in. */}
                        <input
                          className="input"
                          type="text"
                          id="p-area"
                          name="area"
                          list="quartiers"
                          maxLength={80}
                          defaultValue={profile.area ?? ""}
                        />
                      </div>
                    </div>
                    <datalist id="quartiers">
                      {areas.data.map((a) => (
                        <option key={a.label} value={a.label} />
                      ))}
                    </datalist>

                    <div className="field">
                      <label className="field__label" htmlFor="p-address">
                        Repères
                      </label>
                      <textarea
                        className="textarea"
                        id="p-address"
                        name="address_line"
                        maxLength={200}
                        style={{ minHeight: 70 }}
                        defaultValue={profile.address_line ?? ""}
                      />
                    </div>

                    <div className="field">
                      <label className="field__label" htmlFor="p-whatsapp">
                        Téléphone WhatsApp
                      </label>
                      <input
                        className="input"
                        type="tel"
                        id="p-whatsapp"
                        name="whatsapp_phone_e164"
                        pattern="\+[1-9][0-9]{7,14}"
                        defaultValue={profile.whatsapp_phone_e164 ?? ""}
                      />
                    </div>
                  </div>
                  <div className="card__foot">
                    <div className="row">
                      <span className="grow" />
                      <button className="btn btn--primary" type="submit">
                        <span className="btn__label--idle">Enregistrer</span>
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
                </form>
              </div>

              {/* --- The booking policy ---
                  The design gives this its own room. It stays here until that
                  room carries all five fields: `PUT /v1/booking-policy`
                  replaces the resource whole, so a screen that posts three of
                  them wipes the other two. */}
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Règles de réservation</div>
                    <div className="panel__sub">
                      Comment tourne votre carnet, ce qu’aucune cliente ne lit
                    </div>
                  </div>
                </div>
                {/* Its own form for its own resource: correcting an address
                    must never reset a notice period. */}
                <form action={savePolicy}>
                  <div className="card__body">
                    <div className="cols cols--2" style={{ gap: "var(--s-5)" }}>
                      <div className="field">
                        {/* "Pas des creneaux" reads as "no slots" before it
                            reads as a step, and the two meanings are opposite.
                            It is not the length of an appointment either - that
                            belongs to the service - so the label says what the
                            number actually sets: the spacing of the grid. */}
                        <label className="field__label" htmlFor="b-slot">
                          Intervalle entre deux horaires proposés
                        </label>
                        <div className="input-group input-group--suffix">
                          <input
                            className="input"
                            id="b-slot"
                            type="number"
                            name="slot_granularity_minutes"
                            inputMode="numeric"
                            required
                            min={5}
                            max={120}
                            defaultValue={policy.slot_granularity_minutes}
                          />
                          <span className="input-group__suffix">minutes</span>
                        </div>
                        <p className="field__hint">
                          <Icon name="info" size={16} /> Sur 30, vous proposez
                          9h00, 9h30, 10h00. Quinze convient à un salon, soixante
                          à qui travaille en demi-journées. Ce n’est pas la durée
                          d’un rendez-vous&nbsp;: celle-là est sur la prestation.
                        </p>
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="b-lead">
                          Délai de prévenance
                        </label>
                        <div className="input-group input-group--suffix">
                          <input
                            className="input"
                            id="b-lead"
                            type="number"
                            name="min_lead_time_minutes"
                            inputMode="numeric"
                            required
                            min={0}
                            max={20160}
                            defaultValue={policy.min_lead_time_minutes}
                          />
                          <span className="input-group__suffix">minutes</span>
                        </div>
                        <p className="field__hint">
                          Le temps qu’il vous faut pour réagir. Zéro&nbsp;: on
                          peut réserver le créneau suivant.
                        </p>
                      </div>
                    </div>

                    <div className="cols cols--2" style={{ gap: "var(--s-5)" }}>
                      <div className="field">
                        <label className="field__label" htmlFor="b-horizon">
                          Ouverture des réservations
                        </label>
                        <div className="input-group input-group--suffix">
                          <input
                            className="input"
                            id="b-horizon"
                            type="number"
                            name="max_advance_days"
                            inputMode="numeric"
                            required
                            min={1}
                            max={365}
                            defaultValue={policy.max_advance_days}
                          />
                          <span className="input-group__suffix">jours</span>
                        </div>
                        <p className="field__hint">
                          Au-delà, les créneaux ne sont pas proposés.
                        </p>
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="b-cancel">
                          Annulation possible jusqu’à
                        </label>
                        <div className="input-group input-group--suffix">
                          <input
                            className="input"
                            id="b-cancel"
                            type="number"
                            name="cancellation_deadline_minutes"
                            inputMode="numeric"
                            required
                            min={0}
                            max={20160}
                            defaultValue={policy.cancellation_deadline_minutes}
                          />
                          <span className="input-group__suffix">minutes</span>
                        </div>
                        <p className="field__hint">
                          Avant le rendez-vous. Passé ce délai, le client ne peut
                          plus annuler seul&nbsp;: il devra vous appeler.
                        </p>
                      </div>
                    </div>

                    <div style={{ marginTop: "var(--s-5)" }}>
                      <label className="switch" style={{ width: "100%" }}>
                        <input
                          type="checkbox"
                          name="auto_confirm"
                          defaultChecked={policy.auto_confirm}
                        />
                        <span className="switch__track" />
                        <span className="grow">
                          <span className="t-sm t-strong">
                            Confirmer automatiquement les demandes
                          </span>
                          <span className="t-xs" style={{ display: "block" }}>
                            Désactivée, chaque demande attend votre accord dans
                            l’agenda. Une saisie au comptoir est confirmée dans
                            tous les cas&nbsp;: c’est vous qui l’écrivez.
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="card__foot">
                    <div className="row">
                      <span className="grow" />
                      <button className="btn btn--primary" type="submit">
                        <span className="btn__label--idle">Enregistrer les règles</span>
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
                </form>
              </div>
            </div>

            <aside className="sticky-aside" style={{ display: "grid", gap: "var(--s-5)" }}>
              <div className="panel">
                <div className="panel__head">
                  <div className="panel__title">Publication</div>
                  {profile.suspended_at ? (
                    <span className="badge badge--danger">
                      <Icon name="ban" />
                      Retirée
                    </span>
                  ) : profile.published ? (
                    <span className="badge badge--success">
                      <Icon name="globe" />
                      En ligne
                    </span>
                  ) : (
                    <span className="badge badge--warning">
                      <Icon name="eye-off" />
                      Brouillon
                    </span>
                  )}
                </div>
                <div className="card__body">
                  {/* Offered only when pressing it would work. It used to be
                      offered always, so a provider with an empty catalogue
                      ticked it, saved, and was told the save had failed -
                      naming nothing, while the server knew exactly what was
                      missing. Readiness answers with the same predicates the
                      gate uses, so this and publishing cannot disagree. Still
                      offered to a published page, because unpublishing is
                      always allowed. */}
                  {readiness.can_publish || profile.published ? (
                    /* Its own form of its own single field, so turning the
                       switch IS the save. It used to set a field of the form
                       in the other column, which meant a provider turned it,
                       saw it turn, and left with a page still offline. */
                    <form action={setPublished}>
                      {/* The state wanted, not a request to flip: a page left
                          open in a second tab and clicked twice lands on the
                          same answer both times. */}
                      <input
                        type="hidden"
                        name="published"
                        value={profile.published ? "" : "on"}
                      />
                      <label
                        className="switch"
                        htmlFor={PUBLISH_SUBMIT}
                        style={{ width: "100%" }}
                      >
                        {/* Nameless and unreachable: it sends nothing and it is
                            what the design's track reads. Its state is the
                            server's answer, so the switch never shows a
                            publication that has not happened. */}
                        <input
                          type="checkbox"
                          defaultChecked={profile.published}
                          tabIndex={-1}
                          aria-hidden="true"
                        />
                        <span className="switch__track" />
                        <span className="grow">
                          <span className="t-sm t-strong">Page visible du public</span>
                          <span className="t-xs" style={{ display: "block" }}>
                            Le changement est enregistré tout de suite.
                            Désactiver la retire des recherches&nbsp;; vos
                            rendez-vous restent intacts.
                          </span>
                        </span>
                      </label>
                      {/* Off-screen but focusable, and named for what pressing
                          it does rather than for the state beside it - it is
                          what a keyboard and a screen reader reach. */}
                      <input
                        className="sr-only"
                        id={PUBLISH_SUBMIT}
                        type="submit"
                        value={
                          profile.published
                            ? "Retirer ma page de l’annuaire"
                            : "Publier ma page"
                        }
                      />
                    </form>
                  ) : (
                    <Notice tone="warning" title="Publication indisponible">
                      Une condition n’est pas remplie. L’interrupteur apparaîtra
                      dès qu’elle le sera.
                    </Notice>
                  )}

                  <div style={{ marginTop: "var(--s-5)" }}>
                    <div className="t-overline" style={{ marginBottom: "var(--s-3)" }}>
                      Conditions
                    </div>
                    <ul className="checklist">
                      <Condition
                        done={readiness.has_service}
                        label="Une prestation active"
                        doneNote="Au moins une prestation est en ligne"
                        todoNote="Aucune prestation active"
                        href="/dashboard/services"
                        action="Créer"
                      />
                      <Condition
                        done={readiness.has_hours}
                        label="Des horaires d’ouverture"
                        doneNote="Votre semaine type est déclarée"
                        todoNote="Aucun horaire déclaré"
                        href="/dashboard/hours"
                        action="Déclarer"
                      />
                      <Condition
                        done={readiness.has_bookable_staff}
                        label="Une personne réservable"
                        doneNote="Quelqu’un peut recevoir un rendez-vous"
                        todoNote="Aucune personne réservable"
                        href="/dashboard/team"
                        action="Ajouter"
                      />
                    </ul>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel__head">
                  <div className="panel__title">Lien et QR code</div>
                </div>
                <div className="card__body">
                  {profile.public_url ? (
                    <div className="publink">
                      <span className="publink__url">{address}</span>
                      <button
                        className="btn btn--ghost btn--sm btn--icon"
                        type="button"
                        data-copy={profile.public_url}
                        aria-label="Copier"
                      >
                        <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                          <Icon name="copy" size={18} />
                        </span>
                      </button>
                    </div>
                  ) : (
                    <p className="t-xs">
                      Le lien n’est pas encore disponible. Votre page reste
                      joignable à /p/{profile.slug}.
                    </p>
                  )}
                  <p className="t-xs" style={{ marginTop: "var(--s-3)" }}>
                    <Icon name="lock" size={16} /> Cette adresse ne change
                    jamais&nbsp;: elle est imprimée sur vos affiches et déjà
                    envoyée à vos clients.
                  </p>

                  <div
                    style={{
                      display: "grid",
                      justifyItems: "center",
                      marginTop: "var(--s-5)",
                    }}
                  >
                    {/* The API draws the square and this server passes it on.
                        A plain <img>, and a plain <a> under it: the target
                        answers with an image rather than a page, and next/link
                        would prefetch and navigate to it as one. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="qr"
                      src={QR_CODE}
                      alt="QR code de votre page"
                      width={180}
                      height={180}
                    />
                    <div className="row" style={{ marginTop: "var(--s-4)", gap: "var(--s-2)" }}>
                      <a
                        className="btn btn--secondary btn--sm"
                        href={QR_CODE}
                        download={`qr-${profile.slug}.svg`}
                      >
                        <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                          <Icon name="download" size={18} />
                        </span>
                        <span className="btn__label--idle">Télécharger</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * One line of the publish gate.
 *
 * <p>The note restates the predicate rather than counting anything: readiness
 * answers three booleans, and "5 prestations en ligne" would be a figure this
 * screen does not have.
 */
function Condition({
  done,
  label,
  doneNote,
  todoNote,
  href,
  action,
}: {
  done: boolean;
  label: string;
  doneNote: string;
  todoNote: string;
  href: string;
  action: string;
}) {
  return (
    <li className={`checklist__item checklist__item--${done ? "done" : "todo"}`}>
      <span className="checklist__mark">
        {done ? <Icon name="check" size={16} /> : null}
      </span>
      <span className="checklist__text grow">
        {label}
        <small>{done ? doneNote : todoNote}</small>
      </span>
      {done ? null : (
        <Link className="btn btn--secondary btn--sm" href={href}>
          <span className="btn__label--idle">{action}</span>
        </Link>
      )}
    </li>
  );
}
