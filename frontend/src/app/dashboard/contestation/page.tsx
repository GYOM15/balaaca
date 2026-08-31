import { Icon } from "@/components/icon";
import { ActionButton, Badge, Notice, SectionHead } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type {
  ContestationView,
  ProviderProfile,
} from "@/lib/types";
import { contest } from "./actions";

/**
 * A suspension explained, and the one answer the business is allowed.
 *
 * <p>The reason and the date come from the profile; `/v1/provider-profile/
 * contestation` holds whatever has already been said about them. That route
 * answers 204 far more often than 200 - almost every business is not suspended,
 * and a suspended one has usually not written yet - so an absent contestation
 * is the ordinary case here and never a failure.
 *
 * <p>What the platform decides afterwards does not arrive through this screen.
 * The contract carries "the operator opened it" and nothing more, so the page
 * says that much and stops: a reinstatement shows up as the suspension being
 * gone, not as a reply.
 */

/** The contract's own type. It belongs in `@/lib/types`, which this pass does not own. */
type Contestation = ContestationView;

/** A suspension is lifted by somebody else. A cached page would deny it. */
export const dynamic = "force-dynamic";

/**
 * What the platform can refuse, in the provider's own terms.
 *
 * <p>`NOT_SUSPENDED` is not in the published catalogue. Two refusals answer
 * VALIDATION_FAILED and the action tells them apart by status, because a
 * message the API will not take and a page that came back online while it was
 * being typed have nothing to say to each other.
 */
const REFUSALS: Record<string, string> = {
  // One sentence, because the API sends one code for both refusals: a message
  // that is empty or too long, and a page that is not suspended at all. There
  // is no NOT_SUSPENDED in the published catalogue - branching on one is how
  // this refusal used to read as the generic sentence.
  //
  // No entity in here, unlike the copy below: these are strings rendered as
  // text, and an `&nbsp;` would arrive on screen spelled out.
  VALIDATION_FAILED:
    "Votre message est vide ou dépasse 2 000 caractères - ou votre page n'est pas suspendue, auquel cas il n'y a rien à contester.",
  INVALID_STATE_TRANSITION:
    "Vous avez déjà répondu à cette suspension. C'est votre premier message que la plateforme lit.",
  FORBIDDEN: "Seul le propriétaire peut répondre à la plateforme.",
  UNKNOWN: "L'envoi n'a pas abouti.",
};

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

export default async function Contestation({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
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

  // After the status rather than beside it: the route answers 204 for every
  // business nobody suspended, so asking in parallel would spend a request on
  // an answer the branch above has already given.
  const contestation = await api<Contestation | undefined>(
    "/v1/provider-profile/contestation",
  );

  return (
    <>
      <div className="pro-head stack stack-2">
        <h1 className="pro-head__title">Votre page est suspendue</h1>
        <p className="t-small t-muted measure">
          Ce que cela change, pourquoi, et comment répondre à la plateforme.
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
          <SectionHead label="Contester cette décision" />

          {/* Above both branches: a second send is refused, and the refusal
              belongs beside the message that already went rather than beside a
              form this page no longer shows. */}
          {query.error ? (
            <Notice tone="danger" title="Votre message n'est pas parti">
              {REFUSALS[query.error] ?? REFUSALS.UNKNOWN}
            </Notice>
          ) : null}

          {contestation ? (
            <div className="card card--pad stack stack-3">
              <div className="row row--between row-3 row--wrap">
                <p className="t-label">Votre message a été transmis</p>
                {contestation.read ? (
                  <Badge label="Lu par la plateforme" tone="success" icon="check" />
                ) : (
                  <Badge label="Pas encore ouvert" tone="neutral" icon="clock" />
                )}
              </div>
              <p className="t-caption t-dim">
                Envoyé le {dateTime(contestation.submitted_at, profile.timezone)}
              </p>
              <p className="t-body measure">{contestation.message}</p>
              <p className="t-caption t-dim measure">
                La plateforme ne répond pas sur cette page&nbsp;: si elle vous
                donne raison, votre page revient en ligne et cet écran vous le
                dira.
              </p>
            </div>
          ) : (
            <form action={contest} className="stack stack-4">
              <p className="t-small t-muted measure">
                Dites ce que vous contestez et ce qui s'est réellement passé. Si
                vous avez une preuve — une photo, un message d'un client, un
                reçu — décrivez-la&nbsp;: c'est ce qui fait la différence.
              </p>

              <label className="field">
                <span className="field__label">
                  Votre message
                  <span className="field__req" aria-hidden="true">*</span>
                </span>
                <textarea
                  className="textarea"
                  name="message"
                  rows={8}
                  required
                  maxLength={2000}
                  placeholder="Ce que vous contestez, et ce qui s'est passé de votre côté."
                />
                <span className="field__hint">
                  <Icon name="info" size={14} /> Un seul message par
                  suspension&nbsp;: vous ne pourrez pas en envoyer un second, ni
                  corriger celui-ci. 2 000 caractères au plus.
                </span>
              </label>

              <ActionButton
                label="Envoyer ma contestation"
                variant="primary"
                type="submit"
                icon="send"
              />
            </form>
          )}
        </section>
      </div>
    </>
  );
}
