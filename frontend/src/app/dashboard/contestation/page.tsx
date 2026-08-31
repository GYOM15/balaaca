import { Icon } from "@/components/icon";
import { Notice, SectionHead } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { ProviderProfile } from "@/lib/types";

/**
 * A suspension explained, and no way to contest it in the product.
 *
 * <p>THERE IS NO CONTESTATION ENDPOINT. The contract carries `suspendProvider`
 * and `reinstateProvider`, both reserved to the platform, and nothing a
 * provider may post about a decision taken against them. So this screen only
 * reads `GET /v1/provider-profile` and stops: it says what the suspension did,
 * shows the reason and the date the operator recorded, and hands over an
 * address. That address is the interim answer - a form posting to a route that
 * does not exist would swallow the one message a suspended business is trying
 * to send, which is worse than having no form at all.
 *
 * <p>When a contestation operation is published, the mailto below becomes a
 * form and an actions.ts appears beside this file. Until then there is nothing
 * for a server action to call, which is why this route has no actions.ts.
 */

/** The one place the support address is written, so it moves in one edit. */
export const CONTACT_EMAIL = "contact@balaaca.com";

/** A suspension is lifted by somebody else. A cached page would deny it. */
export const dynamic = "force-dynamic";

/**
 * What a suspension actually does, which is narrower than it feels.
 *
 * <p>Spelled out because the first belief of a provider whose page vanished is
 * that the business is closed and the bookings are gone. Neither is true, and
 * the diary they are about to stop opening is where today's clients are.
 */
const EFFECTS: { icon: string; title: string; body: string }[] = [
  {
    icon: "ban",
    title: "Votre page est retirée de l'annuaire",
    body: "Elle n'apparaît plus dans les recherches, et vos clients ne peuvent plus l'ouvrir — même avec le lien que vous leur avez donné. Personne ne peut donc réserver en ligne.",
  },
  {
    icon: "calendar-check",
    title: "Les rendez-vous déjà pris tiennent",
    body: "Rien n'a été annulé. Les clients qui avaient réservé avant la suspension sont attendus à l'heure prévue, et vous devez les recevoir.",
  },
  {
    icon: "calendar",
    title: "Votre agenda continue de fonctionner",
    body: "Vous confirmez, déplacez, terminez et inscrivez au comptoir comme d'habitude. Seule l'arrivée de nouveaux clients par la plateforme s'est arrêtée.",
  },
];

export default async function Contestation() {
  const profile = await api<ProviderProfile>("/v1/provider-profile");

  // Read from `status` and not from the presence of `suspended_at`: the two
  // agree, but if they ever disagreed, a page keyed on the date would answer
  // "tout est en ordre" to a business that is off the hub. The date is shown
  // when it is there and the page holds together without it.
  if (profile.status !== "SUSPENDED") {
    return (
      <>
        <div className="pro-head stack stack-2">
          <h1 className="pro-head__title">Contester</h1>
        </div>
        <div className="pro-body" id="contenu">
          <Notice tone="success" title="Rien à contester" icon="check-circle">
            Votre activité est en règle avec la plateforme.
          </Notice>
        </div>
      </>
    );
  }

  const mailto =
    `mailto:${CONTACT_EMAIL}` +
    // The slug and not the business name: two salons may share a name, and the
    // slug is what the operator's own tools take.
    `?subject=${encodeURIComponent(`Contestation de suspension - ${profile.slug}`)}`;

  return (
    <>
      <div className="pro-head stack stack-2">
        <h1 className="pro-head__title">Votre page est suspendue</h1>
        <p className="t-small t-muted measure">
          Ce que cela change, pourquoi, et comment nous répondre.
        </p>
      </div>

      <div className="pro-body stack stack-8" id="contenu">
        <section className="stack stack-4">
          <SectionHead label="La décision" />
          <div className="recap">
            <div className="recap__row">
              <span className="recap__key">Motif</span>
              <span className="recap__val">
                {profile.suspension_reason ?? "Aucun motif n'a été communiqué."}
              </span>
            </div>
            {profile.suspended_at ? (
              <div className="recap__row">
                <span className="recap__key">Depuis le</span>
                <span className="recap__val">
                  {dateTime(profile.suspended_at, profile.timezone)}
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="stack stack-4">
          <SectionHead label="Ce que cela change" />
          <ul className="list list--boxed">
            {EFFECTS.map((effect) => (
              <li key={effect.title}>
                <div className="list-row">
                  <Icon name={effect.icon} size={20} />
                  <span className="grow stack stack-1">
                    <span className="t-small">{effect.title}</span>
                    <span className="t-caption t-dim">{effect.body}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="t-small t-muted measure">
            Republier votre page depuis «&nbsp;Ma page&nbsp;» n'y changera rien.
            C'est la plateforme qui la remet en ligne, et elle seule.
          </p>
        </section>

        <section className="stack stack-4">
          <SectionHead label="Contester" />

          {/* Said plainly rather than dressed up as a form. A provider who
              writes into a box that goes nowhere has lost the days they
              thought they had spent contesting. */}
          <Notice tone="info" title="Il n'y a pas encore de formulaire ici">
            Votre tableau de bord ne sait pas encore transmettre une
            contestation. En attendant, cela se fait par e-mail&nbsp;: la
            réponse vous arrivera par e-mail elle aussi, pas sur cette page.
          </Notice>

          <p className="t-small t-muted measure">
            Dites ce que vous contestez et ce qui s'est réellement passé. Si
            vous avez une preuve — une photo, un message d'un client, un reçu —
            joignez-la&nbsp;: c'est ce qui fait la différence.
          </p>

          {/* A plain anchor: a mailto is not a route, and next/link would try
              to treat it as one. */}
          <a className="btn btn--primary" href={mailto}>
            <Icon name="mail" size={18} />
            <span>Contester par e-mail</span>
          </a>

          <p className="t-caption t-dim">
            {CONTACT_EMAIL} — précisez votre identifiant&nbsp;: {profile.slug}
          </p>
        </section>
      </div>
    </>
  );
}
