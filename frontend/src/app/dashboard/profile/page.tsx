import Link from "next/link";
import { api, publicApi } from "@/lib/api";
import { dateTime, mediaUrl } from "@/lib/format";
import { Icon } from "@/components/icon";
import { ActionButton, Badge, Button, Notice, SectionHead } from "@/components/ui";
import type {
  AreaList,
  BookingPolicy,
  CategoryList,
  LocalityList,
  LocalityView,
  ProviderProfile,
  ReadinessView,
} from "@/lib/types";
import { groupLocalities, localityLabel } from "@/lib/localities";
import { saveProfile, savePolicy, uploadCover, uploadLogo } from "./actions";

export const dynamic = "force-dynamic";

/** Proxied through this server, because the browser cannot reach the API. */
const QR_CODE = "/dashboard/profile/qr-code";

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

  return (
    <div className="stack stack-8">
      <header className="pro-head">
        <h1 className="pro-head__title">Ma page</h1>
        <p className="t-small t-muted">
          Ce que vos clients lisent, et l'adresse à laquelle ils vous trouvent.
        </p>
        <div className="row row-2 row--wrap" style={{ marginTop: "var(--space-2)" }}>
          {profile.published ? (
            <Badge label="En ligne" tone="success" icon="globe" />
          ) : (
            <Badge label="Non publiée" tone="neutral" icon="edit" />
          )}
          <Button
            label="Voir ma page"
            variant="ghost"
            size="sm"
            icon="eye"
            href={`/p/${profile.slug}`}
          />
        </div>
      </header>

      {/* Before anything else, and before the save box: a provider whose page
          has vanished is looking for this and nothing else. */}
      {profile.suspended_at ? (
        <Notice tone="danger" title="Votre page est retirée de l'annuaire" icon="ban">
          Depuis le {dateTime(profile.suspended_at, profile.timezone)}, elle
          n'apparaît plus dans l'annuaire et vos clients ne peuvent plus
          l'ouvrir, même avec le lien.{" "}
          {profile.suspension_reason
            ? `Motif : ${profile.suspension_reason}`
            : "Aucun motif n'a été communiqué."}{" "}
          Vos rendez-vous déjà pris restent dans votre agenda. C'est la
          plateforme qui remet la page en ligne&nbsp;: la republier vous-même n'y
          change rien.
        </Notice>
      ) : null}

      {query.error ? (
        <Notice tone="danger" title="La modification n'a pas abouti">
          {REFUSALS[query.error] ?? REFUSALS.UNKNOWN}
        </Notice>
      ) : null}

      <section className="stack stack-4">
        <SectionHead label="Comment on vous trouve" />
        <p className="t-small t-muted measure">
          Les deux sont construits sur votre identifiant, qui ne change
          jamais&nbsp;— ce qui est imprimé aujourd'hui marchera encore dans deux
          ans.
        </p>

        <div className="row row-4 row--wrap row--top">
          <div className="card card--pad stack stack-3 grow">
            <p className="t-label">Votre lien</p>
            {profile.public_url ? (
              <label className="field">
                <span className="field__label">À copier</span>
                <input className="input" type="text" readOnly value={profile.public_url} />
                <span className="field__hint">
                  Dans votre statut WhatsApp, dans votre bio, dans un message.
                </span>
              </label>
            ) : (
              <p className="t-caption t-dim">
                Le lien n'est pas encore disponible. Votre page reste joignable
                à /p/{profile.slug}.
              </p>
            )}
          </div>

          <div className="card card--pad stack stack-3">
            <p className="t-label">Votre QR code</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={QR_CODE} alt="QR code vers votre page" width={168} height={168} />
            {/* A plain anchor and not <Button>: the target answers with an
                image rather than a page, and next/link would try to prefetch
                and navigate to it as one. */}
            <a className="btn btn--secondary btn--sm" href={QR_CODE} target="_blank" rel="noreferrer">
              <Icon name="download" size={16} />
              <span>Ouvrir en grand</span>
            </a>
            <span className="field__hint">
              À imprimer sur une carte, une vitrine, un reçu. C'est un dessin,
              pas une photo&nbsp;: il reste net à toutes les tailles.
            </span>
          </div>
        </div>
      </section>

      {/* --- Les images --- */}
      <section className="stack stack-4">
        <SectionHead label="Vos images" />
        <p className="t-small t-muted measure">
          C'est ce qu'une cliente voit avant de lire quoi que ce soit. Les
          métadonnées sont retirées à l'envoi&nbsp;— y compris les coordonnées
          GPS qu'un téléphone écrit dans une photo sans le demander.
        </p>

        <div className="row row-4 row--wrap row--top">
          <form
            action={uploadLogo}
            className="card card--pad stack stack-3 grow"
          >
            <p className="t-label">Logo</p>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="avatar avatar--xl avatar--photo" src={logo} alt="Votre logo" width={72} height={72} />
            ) : (
              <p className="t-caption t-dim">
                Aucun logo. Vos initiales tiennent la place en attendant.
              </p>
            )}
            <label className="field">
              <span className="field__label">Choisir une image</span>
              <input className="input" type="file" name="image" accept="image/jpeg,image/png" required />
            </label>
            <ActionButton label="Envoyer le logo" variant="secondary" type="submit" icon="upload" />
          </form>

          <form
            action={uploadCover}
            className="card card--pad stack stack-3 grow"
          >
            <p className="t-label">Couverture</p>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="Votre couverture" width={240} height={90}
                   style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: "var(--radius-md)" }} />
            ) : (
              <p className="t-caption t-dim">
                Aucune couverture. Un croquis de votre métier tient la place.
              </p>
            )}
            <label className="field">
              <span className="field__label">Choisir une image</span>
              <input className="input" type="file" name="image" accept="image/jpeg,image/png" required />
            </label>
            <ActionButton label="Envoyer la couverture" variant="secondary" type="submit" icon="upload" />
          </form>
        </div>
      </section>

      {/* --- Le profil --- */}
      <section className="stack stack-4">
        <SectionHead label="Ce que lisent vos clients" />
        <form action={saveProfile} className="card card--pad-lg stack stack-4">
          {/* Superseded by the commune and the quartier, and carried through
              rather than dropped: the API replaces the profile whole, and the
              directory card still prints this field. Saving would blank the
              place of every provider who has not yet chosen a commune. */}
          <input type="hidden" name="city" value={profile.city ?? ""} />

          <label className="field">
            <span className="field__label">
              Nom<span className="field__req" aria-hidden="true">*</span>
            </span>
            <input className="input" type="text" name="business_name" required maxLength={120}
                   defaultValue={profile.business_name} />
          </label>

          <label className="field">
            <span className="field__label">Description</span>
            <textarea className="textarea" name="description" rows={4} maxLength={2000}
                      defaultValue={profile.description ?? ""}
                      placeholder="Ce que vous faites, depuis quand, ce qui vous distingue." />
          </label>

          <div className="row row-3 row--wrap row--top">
            <label className="field grow">
              <span className="field__label">Métier</span>
              <select className="select" name="category_slug" defaultValue={profile.category_slug ?? ""}>
                <option value="">Non précisé</option>
                {categories.data.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.label_fr}</option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span className="field__label">Commune</span>
              <select className="select" name="locality_slug"
                      defaultValue={profile.locality?.slug ?? ""}>
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
              <span className="field__hint">
                C'est là-dessus qu'un client filtre l'annuaire.
              </span>
            </label>
          </div>

          <div className="row row-3 row--wrap row--top">
            <label className="field grow">
              <span className="field__label">Quartier</span>
              {/* Free text with suggestions, because the server takes it that
                  way: Guinea's quartiers are thousands of names this platform
                  does not write, and a closed list would be missing exactly the
                  one this provider works in. */}
              <input className="input" type="text" name="area" list="quartiers"
                     maxLength={80} autoComplete="off"
                     defaultValue={profile.area ?? ""} placeholder="Nongo, Kipé, Dixinn Port…" />
              <datalist id="quartiers">
                {areas.data.map((a) => (
                  <option key={a.label} value={a.label} />
                ))}
              </datalist>
              <span className="field__hint">
                Comme vous le dites. Reprenez l'orthographe proposée si elle
                existe&nbsp;: c'est ce qui regroupe les pages d'un même quartier.
              </span>
            </label>
            <label className="field grow">
              <span className="field__label">Adresse</span>
              <input className="input" type="text" name="address_line" maxLength={200}
                     defaultValue={profile.address_line ?? ""}
                     placeholder="Repère, rue, étage" />
              <span className="field__hint">Un repère vaut mieux qu'un numéro de rue.</span>
            </label>
          </div>

          <div className="row row-3 row--wrap row--top">
            <label className="field grow">
              <span className="field__label">Téléphone public</span>
              <input className="input" type="tel" name="public_phone_e164"
                     pattern="\+[1-9][0-9]{7,14}" placeholder="+224622000001"
                     defaultValue={profile.public_phone_e164 ?? ""} />
            </label>
            <label className="field grow">
              <span className="field__label">WhatsApp</span>
              <input className="input" type="tel" name="whatsapp_phone_e164"
                     pattern="\+[1-9][0-9]{7,14}" placeholder="+224622000001"
                     defaultValue={profile.whatsapp_phone_e164 ?? ""} />
            </label>
          </div>

          <div className="row row-3 row--wrap row--top">
            <label className="field grow">
              <span className="field__label">Courriel public</span>
              <input className="input" type="email" name="public_email" maxLength={200}
                     defaultValue={profile.public_email ?? ""} />
            </label>
            <label className="field">
              <span className="field__label">
                Fuseau horaire<span className="field__req" aria-hidden="true">*</span>
              </span>
              <input className="input" type="text" name="timezone" required maxLength={64}
                     defaultValue={profile.timezone} />
              <span className="field__hint">Toutes vos heures se lisent dedans.</span>
            </label>
          </div>

          {/* Offered only when pressing it would work. It used to be offered
              always, so a provider with an empty catalogue ticked it, saved,
              and was told the save had failed - naming nothing, while the
              server knew exactly what was missing. Readiness answers with the
              same predicates the gate uses, so this and publishing cannot
              disagree. Still offered to a published page, because unpublishing
              is always allowed. */}
          {readiness.can_publish || profile.published ? (
            <label className="switch">
              <input type="checkbox" name="published" defaultChecked={profile.published} />
              <span className="switch__track"><span className="switch__thumb" /></span>
              <span className="grow">
                <span className="t-small">Ma page est visible par les clients</span>
                <span className="field__hint" style={{ display: "block" }}>
                  Publiée, elle s'ouvre à toute personne qui reçoit le lien et
                  apparaît dans l'annuaire. Dépubliée, elle n'est visible que de
                  vous, et vos rendez-vous déjà pris restent.
                </span>
              </span>
            </label>
          ) : (
            <Notice tone="info" icon="info" title="Il manque encore quelque chose pour publier">
              <div className="stack stack-2">
                {!readiness.has_service && (
                  <Link href="/dashboard/services">Créer une prestation</Link>
                )}
                {!readiness.has_hours && (
                  <Link href="/dashboard/hours">Déclarer vos horaires</Link>
                )}
                {!readiness.has_bookable_staff && (
                  <Link href="/dashboard/team">Rendre quelqu'un réservable</Link>
                )}
              </div>
            </Notice>
          )}

          <ActionButton label="Enregistrer ma page" variant="primary" type="submit" icon="check" />
        </form>
      </section>

      {/* --- La politique --- */}
      <section className="stack stack-4">
        <SectionHead label="Règles de réservation" />
        <p className="t-small t-muted measure">
          Comment tourne votre carnet. Ce n'est pas ce qu'une cliente lit&nbsp;:
          ce sont les règles qui décident quand elle peut réserver. C'est un
          formulaire à part pour que corriger une adresse ne remette jamais à
          zéro un délai de prévenance.
        </p>

        <form action={savePolicy} className="card card--pad-lg stack stack-4">
          <div className="row row-3 row--wrap row--top">
            <label className="field">
              <span className="field__label">Pas des créneaux</span>
              <input className="input" type="number" name="slot_granularity_minutes"
                     required min={5} max={120} defaultValue={policy.slot_granularity_minutes} />
              <span className="field__hint">
                minutes. Quinze convient à un salon&nbsp;; un photographe qui
                travaille en demi-journées n'en veut pas trente-deux avant midi.
              </span>
            </label>
            <label className="field">
              <span className="field__label">Délai de prévenance</span>
              <input className="input" type="number" name="min_lead_time_minutes"
                     required min={0} max={20160} defaultValue={policy.min_lead_time_minutes} />
              <span className="field__hint">
                minutes. Le temps qu'il vous faut pour réagir. Zéro&nbsp;: on
                peut réserver le créneau suivant.
              </span>
            </label>
          </div>

          <div className="row row-3 row--wrap row--top">
            <label className="field">
              <span className="field__label">Horizon</span>
              <input className="input" type="number" name="max_advance_days"
                     required min={1} max={365} defaultValue={policy.max_advance_days} />
              <span className="field__hint">jours d'avance ouverts.</span>
            </label>
            <label className="field">
              <span className="field__label">Annulation possible jusqu'à</span>
              <input className="input" type="number" name="cancellation_deadline_minutes"
                     required min={0} max={20160} defaultValue={policy.cancellation_deadline_minutes} />
              <span className="field__hint">
                minutes avant. Ne vous lie jamais&nbsp;: annuler votre propre
                rendez-vous, c'est tenir votre agenda.
              </span>
            </label>
          </div>

          <label className="switch">
            <input type="checkbox" name="auto_confirm" defaultChecked={policy.auto_confirm} />
            <span className="switch__track"><span className="switch__thumb" /></span>
            <span className="grow">
              <span className="t-small">Confirmer automatiquement les demandes</span>
              <span className="field__hint" style={{ display: "block" }}>
                Décochée, chaque demande attend votre accord dans l'agenda. Une
                saisie au comptoir est confirmée dans tous les cas&nbsp;: c'est
                vous qui l'écrivez.
              </span>
            </span>
          </label>

          <p className="field__hint">
            <Icon name="info" size={14} /> Ces bornes sont celles que la base
            accepte&nbsp;: une valeur que ce formulaire refuse est une valeur
            que le serveur refuserait aussi.
          </p>

          <ActionButton label="Enregistrer les règles" variant="primary" type="submit" icon="check" />
        </form>
      </section>
    </div>
  );
}
