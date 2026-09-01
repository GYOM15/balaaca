import { Icon } from "@/components/icon";
import { Badge, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, day } from "@/lib/format";
import type { ContestationView, ProviderProfile } from "@/lib/types";
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
        <div className="appbar">
          <div className="appbar__in">
            <div>
              <h1 className="appbar__title">Contestation</h1>
              <div className="appbar__sub">Votre page est en ligne</div>
            </div>
          </div>
        </div>

        <main className="app__main has-tabbar" id="contenu">
          <div className="app__inner">
            <div style={{ maxWidth: 760 }}>
              <Notice tone="success" title="Rien à contester" icon="check-circle">
                Votre page est visible du public et votre activité est en règle
                avec la plateforme.
              </Notice>
            </div>
          </div>
        </main>
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
      <div className="appbar">
        <div className="appbar__in">
          <div>
            <h1 className="appbar__title">Suspension de votre établissement</h1>
            {profile.suspended_at ? (
              <div className="appbar__sub">
                Depuis le {dateTime(profile.suspended_at, profile.timezone)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <main className="app__main has-tabbar" id="contenu">
        <div className="app__inner">
          <div style={{ maxWidth: 760 }} className="stack">
            {/* The first belief of a provider whose page has vanished is that
                the business is closed and the bookings are gone. Neither is
                true, and the diary they are about to stop opening is where
                today's clients are - so it is said before anything else. */}
            <Notice tone="danger" title="Votre page n’est plus visible du public">
              Elle n’apparaît plus dans les recherches et n’accepte plus de
              nouvelles réservations, même avec le lien que vous avez donné à vos
              clients. Les rendez-vous déjà pris restent valables et sont
              toujours dans votre agenda&nbsp;: vous confirmez, déplacez et
              terminez comme d’habitude. Republier votre page depuis
              «&nbsp;Ma page&nbsp;» n’y changera rien&nbsp;: c’est la plateforme
              qui la remet en ligne, et elle seule.
            </Notice>

            <div className="panel" style={{ marginTop: "var(--s-6)" }}>
              <div className="panel__head">
                <div>
                  <div className="panel__title">Motif communiqué par la modération</div>
                  {profile.suspended_at ? (
                    <div className="panel__sub">
                      Décision du {day(profile.suspended_at, profile.timezone)}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="card__body">
                <p className="t-body">
                  {profile.suspension_reason ?? "Aucun motif n’a été communiqué."}
                </p>
                <div className="dl dl--lined" style={{ marginTop: "var(--s-6)" }}>
                  {profile.suspended_at ? (
                    <div className="dl__row">
                      <span className="dl__key">Date de la décision</span>
                      <span className="dl__val">
                        {day(profile.suspended_at, profile.timezone)}
                      </span>
                    </div>
                  ) : null}
                  <div className="dl__row">
                    <span className="dl__key">État</span>
                    <span className="dl__val">
                      <Badge label="Suspendu" tone="danger" icon="ban" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Above both branches: a second send is refused, and the refusal
                belongs beside the message that already went rather than beside
                a form this page no longer shows. */}
            {query.error ? (
              <div style={{ marginTop: "var(--s-6)" }}>
                <Notice tone="danger" title="Votre message n’est pas parti">
                  {REFUSALS[query.error] ?? REFUSALS.UNKNOWN}
                </Notice>
              </div>
            ) : null}

            {contestation ? (
              <div className="panel" style={{ marginTop: "var(--s-6)" }}>
                <div className="panel__head">
                  <div className="panel__title">Votre réponse</div>
                  {contestation.read ? (
                    <Badge label="Lue par la plateforme" tone="success" icon="check" />
                  ) : (
                    <Badge label="Envoyée · pas encore ouverte" tone="info" icon="hourglass" />
                  )}
                </div>
                <div className="card__body">
                  <p className="t-sm" style={{ color: "var(--text-tertiary)" }}>
                    Envoyée le {day(contestation.submitted_at, profile.timezone)}
                  </p>
                  <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
                    {contestation.message}
                  </p>
                  <div style={{ marginTop: "var(--s-5)" }}>
                    <Notice tone="info" title="En attente d’une décision">
                      La plateforme ne répond pas sur cette page&nbsp;: si elle
                      vous donne raison, votre page revient en ligne et cet écran
                      vous le dira. Vous ne pouvez envoyer qu’une seule réponse
                      par suspension.
                    </Notice>
                  </div>
                </div>
              </div>
            ) : (
              <div className="panel" style={{ marginTop: "var(--s-6)" }}>
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Répondre</div>
                    <div className="panel__sub">
                      Une seule réponse est possible. Prenez le temps de l’écrire.
                    </div>
                  </div>
                </div>
                <form action={contest}>
                  <div className="card__body">
                    <div className="field">
                      <label className="field__label" htmlFor="appeal-message">
                        Votre explication
                        <span className="field__req" aria-hidden="true">
                          *
                        </span>
                      </label>
                      <textarea
                        className="textarea"
                        id="appeal-message"
                        name="message"
                        style={{ minHeight: 180 }}
                        required
                        maxLength={2000}
                        placeholder="Expliquez ce qui s’est passé et ce que vous avez changé."
                      />
                      <p className="field__hint">
                        Restez factuel. Décrivez ce qui a été corrigé&nbsp;: c’est
                        ce qui pèse le plus dans la décision. Un seul message par
                        suspension, 2 000 caractères au plus.
                      </p>
                    </div>
                  </div>
                  <div className="card__foot">
                    <div className="row">
                      <span className="grow"></span>
                      <button className="btn btn--primary" type="submit">
                        <Icon name="send" size={18} className="btn__icon--idle" />
                        <span className="btn__label--idle">Envoyer ma réponse</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
