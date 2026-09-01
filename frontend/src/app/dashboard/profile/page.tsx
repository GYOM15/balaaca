import { api, publicApi } from "@/lib/api";
import { dateTime, mediaUrl } from "@/lib/format";
import { Icon } from "@/components/icon";
import { ActionButton, Badge, Button, EmptyState, Notice, initials } from "@/components/ui";
import type {
  AreaList,
  BookingPolicy,
  CategoryList,
  LocalityList,
  ProviderProfile,
  ReadinessView,
} from "@/lib/types";
import { groupLocalities, localityLabel } from "@/lib/localities";
import { saveProfile, savePolicy, uploadCover, uploadLogo } from "./actions";

export const dynamic = "force-dynamic";

/** Proxied through this server, because the browser cannot reach the API. */
const QR_CODE = "/dashboard/profile/qr-code";

/**
 * The publish switch lives in the aside, beside the state it changes, while
 * the save button that carries it sits in the panel foot. `form` is what binds
 * a control to a form it is not nested in - native, so the no-JavaScript
 * submission carries it too.
 */
const PROFILE_FORM = "profile-form";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire modifie la page et les réglages.",
  // The API sends INVALID_STATE_TRANSITION here, not a code of its own. This
  // key used to be NOTHING_TO_PUBLISH, which the catalogue does not publish -
  // so every refusal to publish fell through to the generic sentence while a
  // useful one sat unreachable on this line.
  INVALID_STATE_TRANSITION:
    "Il faut au moins une prestation, des horaires et quelqu'un de réservable avant de publier.",
  VALIDATION_FAILED:
    "Vérifiez la commune, le numéro de téléphone (format +224…) et le fuseau horaire.",
  NO_FILE: "Choisissez un fichier avant d'envoyer.",
  NOT_AN_IMAGE: "Seuls le JPEG et le PNG sont acceptés.",
  UNKNOWN: "L'enregistrement n'a pas abouti.",
};

/** The stack's gap, written the way the mockup writes it. */
const gap = (value: string) => ({ "--stack-gap": value }) as React.CSSProperties;

export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const [profile, readiness, policy, categories, localities, areas] = await Promise.all([
    api<ProviderProfile>("/v1/provider-profile"),
    api<ReadinessView>("/v1/provider-profile/readiness"),
    api<BookingPolicy>("/v1/booking-policy"),
    publicApi<CategoryList>("/v1/categories"),
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
          <div>
            <h1 className="appbar__title">Ma page</h1>
            <div className="appbar__sub">
              {profile.suspended_at
                ? "Retirée de l’annuaire"
                : `${profile.published ? "En ligne" : "Brouillon"} · ${address}`}
            </div>
          </div>
          <div className="appbar__actions">
            <Button
              label="Voir en public"
              variant="secondary"
              size="sm"
              icon="external"
              href={`/p/${profile.slug}`}
            />
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
                  <Button
                    label="Comprendre et répondre"
                    variant="danger"
                    size="sm"
                    href="/dashboard/contestation"
                  />
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
                    <div
                      id="cover-preview"
                      style={{
                        position: "relative",
                        borderRadius: "var(--r-sm)",
                        overflow: "hidden",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt="Bandeau actuel"
                          style={{ width: "100%", aspectRatio: "15/4", objectFit: "cover" }}
                        />
                      ) : (
                        <EmptyState
                          compact
                          sketch="storefront"
                          title="Aucun bandeau"
                          body="Un croquis de votre métier tient la place sur votre page publique."
                        />
                      )}
                    </div>
                    <div className="field" style={{ marginTop: "var(--s-5)" }}>
                      <label className="field__label" htmlFor="cover-file">
                        Changer le bandeau
                      </label>
                      <input
                        className="input"
                        id="cover-file"
                        type="file"
                        name="image"
                        accept="image/jpeg,image/png"
                        required
                        data-preview="cover-preview"
                      />
                      <p className="field__hint">
                        JPEG ou PNG, 5 Mo maximum. Les métadonnées sont retirées
                        à l’envoi&nbsp;— y compris les coordonnées GPS qu’un
                        téléphone écrit dans une photo sans le demander.
                      </p>
                    </div>
                    <div style={{ marginTop: "var(--s-4)" }}>
                      <ActionButton
                        label="Envoyer le bandeau"
                        variant="secondary"
                        size="sm"
                        type="submit"
                        icon="camera"
                      />
                    </div>
                  </form>

                  <form action={uploadLogo}>
                    <div className="row" style={{ marginTop: "var(--s-5)", gap: "var(--s-4)" }}>
                      {/* Positioned because the preview drops an overlay into
                          it, and an overlay needs a containing block. */}
                      <span
                        className="avatar avatar--xl"
                        id="logo-preview"
                        style={{ position: "relative" }}
                        aria-hidden={logo ? undefined : true}
                      >
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt="Logo actuel" width={76} height={76} />
                        ) : (
                          initials(profile.business_name)
                        )}
                      </span>
                      <div className="grow">
                        <div className="t-strong">Logo</div>
                        <p className="t-xs" style={{ marginTop: 2 }}>
                          Carré, JPEG ou PNG, 5 Mo maximum. Sans logo, vos
                          initiales tiennent la place.
                        </p>
                      </div>
                    </div>
                    <div className="field" style={{ marginTop: "var(--s-4)" }}>
                      <label className="field__label" htmlFor="logo-file">
                        Remplacer le logo
                      </label>
                      <input
                        className="input"
                        id="logo-file"
                        type="file"
                        name="image"
                        accept="image/jpeg,image/png"
                        required
                        data-preview="logo-preview"
                      />
                    </div>
                    <div style={{ marginTop: "var(--s-4)" }}>
                      <ActionButton
                        label="Envoyer le logo"
                        variant="secondary"
                        size="sm"
                        type="submit"
                        icon="upload"
                      />
                    </div>
                  </form>
                </div>
              </div>

              {/* --- The profile --- */}
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Informations publiques</div>
                    <div className="panel__sub">Ce que vos clients lisent</div>
                  </div>
                </div>
                <form action={saveProfile} id={PROFILE_FORM}>
                  <div className="card__body">
                    {/* Superseded by the commune and the quartier, and carried
                        through rather than dropped: the API replaces the
                        profile whole, and the directory card still prints this
                        field. Saving would blank the place of every provider
                        who has not yet chosen a commune. */}
                    <input type="hidden" name="city" value={profile.city ?? ""} />

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
                        placeholder="Ce que vous faites, depuis quand, ce qui vous distingue."
                      />
                    </div>

                    <div className="field">
                      <label className="field__label" htmlFor="p-category">
                        Métier
                      </label>
                      <select
                        className="select"
                        id="p-category"
                        name="category_slug"
                        defaultValue={profile.category_slug ?? ""}
                      >
                        <option value="">Non précisé</option>
                        {categories.data.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.label_fr}
                          </option>
                        ))}
                      </select>
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
                          <option value="">Non précisée</option>
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
                        <p className="field__hint">
                          C’est là-dessus qu’un client filtre l’annuaire.
                        </p>
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
                          autoComplete="off"
                          defaultValue={profile.area ?? ""}
                          placeholder="Nongo, Kipé, Dixinn Port…"
                        />
                        <datalist id="quartiers">
                          {areas.data.map((a) => (
                            <option key={a.label} value={a.label} />
                          ))}
                        </datalist>
                        <p className="field__hint">
                          Reprenez l’orthographe proposée si elle existe&nbsp;:
                          c’est ce qui regroupe les pages d’un même quartier.
                        </p>
                      </div>
                    </div>

                    <div className="field">
                      <label className="field__label" htmlFor="p-address">
                        Repères
                        <span className="field__optional">facultatif</span>
                      </label>
                      <input
                        className="input"
                        type="text"
                        id="p-address"
                        name="address_line"
                        maxLength={200}
                        defaultValue={profile.address_line ?? ""}
                        placeholder="Carrefour de Nongo, immeuble beige au-dessus de la pharmacie."
                      />
                      <p className="field__hint">Un repère vaut mieux qu’un numéro de rue.</p>
                    </div>

                    <div className="cols cols--2" style={{ gap: "var(--s-5)" }}>
                      <div className="field">
                        <label className="field__label" htmlFor="p-phone">
                          Téléphone public
                        </label>
                        <input
                          className="input"
                          type="tel"
                          id="p-phone"
                          name="public_phone_e164"
                          pattern="\+[1-9][0-9]{7,14}"
                          placeholder="+224622000001"
                          defaultValue={profile.public_phone_e164 ?? ""}
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
                          placeholder="+224622000001"
                          defaultValue={profile.whatsapp_phone_e164 ?? ""}
                        />
                      </div>
                    </div>

                    <div className="cols cols--2" style={{ gap: "var(--s-5)" }}>
                      <div className="field">
                        <label className="field__label" htmlFor="p-email">
                          Courriel public
                        </label>
                        <input
                          className="input"
                          type="email"
                          id="p-email"
                          name="public_email"
                          maxLength={200}
                          defaultValue={profile.public_email ?? ""}
                        />
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="p-timezone">
                          Fuseau horaire
                          <span className="field__req" aria-hidden="true">
                            *
                          </span>
                        </label>
                        <input
                          className="input"
                          type="text"
                          id="p-timezone"
                          name="timezone"
                          required
                          maxLength={64}
                          defaultValue={profile.timezone}
                        />
                        <p className="field__hint">Toutes vos heures se lisent dedans.</p>
                      </div>
                    </div>
                  </div>
                  <div className="card__foot">
                    <div className="row">
                      <span className="grow" />
                      <ActionButton
                        label="Enregistrer"
                        variant="primary"
                        type="submit"
                        icon="check"
                      />
                    </div>
                  </div>
                </form>
              </div>

              {/* --- The booking policy --- */}
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
                        <label className="field__label" htmlFor="b-slot">
                          Pas des créneaux
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
                          Quinze convient à un salon&nbsp;; un photographe qui
                          travaille en demi-journées n’en veut pas trente-deux
                          avant midi.
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
                          plus annuler seul&nbsp;: il devra vous appeler. Ne vous
                          lie jamais&nbsp;: annuler votre propre rendez-vous,
                          c’est tenir votre agenda.
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

                    <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
                      <Icon name="info" size={16} /> Ces bornes sont celles que
                      la base accepte&nbsp;: une valeur que ce formulaire refuse
                      est une valeur que le serveur refuserait aussi.
                    </p>
                  </div>
                  <div className="card__foot">
                    <div className="row">
                      <span className="grow" />
                      <ActionButton
                        label="Enregistrer les règles"
                        variant="primary"
                        type="submit"
                        icon="check"
                      />
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
                    <Badge label="Retirée" tone="danger" icon="ban" />
                  ) : profile.published ? (
                    <Badge label="En ligne" tone="success" icon="globe" />
                  ) : (
                    <Badge label="Brouillon" tone="warning" icon="eye-off" />
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
                    <label className="switch" style={{ width: "100%" }}>
                      <input
                        type="checkbox"
                        name="published"
                        form={PROFILE_FORM}
                        defaultChecked={profile.published}
                      />
                      <span className="switch__track" />
                      <span className="grow">
                        <span className="t-sm t-strong">Page visible du public</span>
                        <span className="t-xs" style={{ display: "block" }}>
                          Désactiver la retire des recherches. Vos rendez-vous
                          restent intacts. Le changement prend effet quand vous
                          enregistrez les informations publiques.
                        </span>
                      </span>
                    </label>
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
                        <Icon name="copy" size={18} className="btn__icon--idle" />
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="qr"
                      src={QR_CODE}
                      alt="QR code vers votre page"
                      width={180}
                      height={180}
                    />
                    <div className="row" style={{ marginTop: "var(--s-4)", gap: "var(--s-2)" }}>
                      {/* A plain anchor and not <Button>: the target answers
                          with an image rather than a page, and next/link would
                          try to prefetch and navigate to it as one. */}
                      <a
                        className="btn btn--secondary btn--sm"
                        href={QR_CODE}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Icon name="download" size={16} className="btn__icon--idle" />
                        <span className="btn__label--idle">Ouvrir en grand</span>
                      </a>
                    </div>
                    <p className="t-xs" style={{ marginTop: "var(--s-3)" }}>
                      À imprimer sur une carte, une vitrine, un reçu. C’est un
                      dessin, pas une photo&nbsp;: il reste net à toutes les
                      tailles.
                    </p>
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
      {done ? null : <Button label={action} variant="secondary" size="sm" href={href} />}
    </li>
  );
}
