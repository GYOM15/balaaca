import { api, publicApi } from "@/lib/api";
import { mediaUrl } from "@/lib/format";
import { Icon } from "@/components/icon";
import { ActionButton, Badge, Button, Notice, SectionHead } from "@/components/ui";
import type { BookingPolicy, CategoryList, ProviderProfile } from "@/lib/types";
import { saveProfile, savePolicy, uploadCover, uploadLogo } from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire modifie la page et les réglages.",
  NOTHING_TO_PUBLISH:
    "Il faut au moins une prestation, des horaires et quelqu'un de réservable avant de publier.",
  VALIDATION_FAILED:
    "Vérifiez le numéro de téléphone (format +224…) et le fuseau horaire.",
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
  const [profile, policy, categories] = await Promise.all([
    api<ProviderProfile>("/v1/provider-profile"),
    api<BookingPolicy>("/v1/booking-policy"),
    publicApi<CategoryList>("/v1/categories"),
  ]);

  const logo = mediaUrl(profile.logo_url);
  const cover = mediaUrl(profile.cover_url);

  return (
    <div className="stack stack-8">
      <header className="pro-head">
        <h1 className="pro-head__title">Ma page</h1>
        <p className="t-small t-muted">
          Adresse publique&nbsp;: <strong>/p/{profile.slug}</strong> — choisie
          une fois, elle ne change plus. C'est elle qui est sur le QR code.
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

      {query.error ? (
        <Notice tone="danger" title="La modification n'a pas abouti">
          {REFUSALS[query.error] ?? REFUSALS.UNKNOWN}
        </Notice>
      ) : null}

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
            encType="multipart/form-data"
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
            encType="multipart/form-data"
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
              <span className="field__label">Ville</span>
              <input className="input" type="text" name="city" maxLength={80}
                     defaultValue={profile.city ?? ""} placeholder="Conakry" />
            </label>
          </div>

          <label className="field">
            <span className="field__label">Adresse</span>
            <input className="input" type="text" name="address_line" maxLength={200}
                   defaultValue={profile.address_line ?? ""}
                   placeholder="Quartier, repère, rue" />
            <span className="field__hint">Un repère vaut mieux qu'un numéro de rue.</span>
          </label>

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
