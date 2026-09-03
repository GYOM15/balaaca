import { Icon } from "@/components/icon";
import { api } from "@/lib/api";
import type { BookingPolicy } from "@/lib/types";
import { savePolicy } from "../profile/actions";

export const dynamic = "force-dynamic";

/**
 * The bar's button sits outside the form it submits; `form` is what binds them,
 * natively, with no script.
 */
const POLICY_FORM = "policy-form";

/**
 * How a customer may book, in the three terms the design puts on this screen.
 *
 * <p>The action is the one that already exists rather than a second one:
 * `/v1/booking-policy` is replaced WHOLE, so two writers of the same resource
 * would be two chances to drop a field.
 *
 * <p>Which is also why the policy's other two terms - the slot grid and the
 * notice period - travel as hidden fields. This screen does not draw them, and
 * a PUT that omitted them would not leave them alone: it would set them to
 * zero, and a salon would discover it as a diary offering every minute of the
 * day.
 */
export default async function BookingRules() {
  const policy = await api<BookingPolicy>("/v1/booking-policy");

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
            <h1 className="appbar__title">Règles de réservation</h1>
            <div className="appbar__sub">Comment vos clients peuvent réserver</div>
          </div>
          <div className="appbar__actions">
            {/* The design's `data-optimistic` is deliberately not carried: it
                cancels the click and raises a toast that says "saved", which on
                a form that really saves is a lie with a real form behind it. */}
            <button className="btn btn--primary btn--sm" type="submit" form={POLICY_FORM}>
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
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          <form className="stack" style={{ maxWidth: 720 }} action={savePolicy} id={POLICY_FORM}>
            <div className="panel">
              <div className="panel__head">
                <div className="panel__title">Confirmation</div>
              </div>
              <div className="card__body">
                <div className="choice-grid choice-grid--2">
                  <label className="choice">
                    <input
                      type="radio"
                      name="auto_confirm"
                      value="off"
                      defaultChecked={!policy.auto_confirm}
                    />
                    <span className="choice__mark">
                      <Icon name="check-circle" />
                    </span>
                    <span className="choice__head">
                      <span className="choice__icon">
                        <Icon name="user-check" />
                      </span>
                      <span className="choice__title">Je confirme moi-même</span>
                    </span>
                    <span className="choice__desc">
                      Chaque demande attend votre accord. Vous gardez la main, mais il
                      faut répondre.
                    </span>
                  </label>
                  <label className="choice">
                    <input
                      type="radio"
                      name="auto_confirm"
                      value="on"
                      defaultChecked={policy.auto_confirm}
                    />
                    <span className="choice__mark">
                      <Icon name="check-circle" />
                    </span>
                    <span className="choice__head">
                      <span className="choice__icon">
                        <Icon name="check-circle" />
                      </span>
                      <span className="choice__title">Confirmation automatique</span>
                    </span>
                    <span className="choice__desc">
                      Le rendez-vous est confirmé immédiatement. Pratique quand l’agenda
                      est fiable.
                    </span>
                  </label>
                </div>

                {/* Carried, not drawn: see the note on the component above. */}
                <input
                  type="hidden"
                  name="slot_granularity_minutes"
                  value={policy.slot_granularity_minutes}
                />
                <input
                  type="hidden"
                  name="min_lead_time_minutes"
                  value={policy.min_lead_time_minutes}
                />
              </div>
            </div>

            <div className="panel">
              <div className="panel__head">
                <div className="panel__title">Annulation par le client</div>
              </div>
              <div className="card__body">
                <div className="field">
                  <label className="field__label" htmlFor="s-delai">
                    Délai minimum avant le rendez-vous
                  </label>
                  <div className="input-group input-group--suffix">
                    {/* Minutes, because that is the unit the column holds. The
                        design says "heures", and printing 1,5 for ninety
                        minutes - or rounding it - would be the form lying about
                        what it is about to store. */}
                    <input
                      className="input"
                      id="s-delai"
                      name="cancellation_deadline_minutes"
                      inputMode="numeric"
                      required
                      defaultValue={policy.cancellation_deadline_minutes}
                    />
                    <span className="input-group__suffix">minutes</span>
                  </div>
                  <p className="field__hint">
                    Passé ce délai, le client ne peut plus annuler seul : il devra vous
                    appeler.
                  </p>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel__head">
                <div className="panel__title">Ouverture des réservations</div>
              </div>
              <div className="card__body">
                <div className="field">
                  <label className="field__label" htmlFor="s-horizon">
                    Jusqu’à combien de jours à l’avance
                  </label>
                  <div className="input-group input-group--suffix">
                    <input
                      className="input"
                      id="s-horizon"
                      name="max_advance_days"
                      inputMode="numeric"
                      required
                      defaultValue={policy.max_advance_days}
                    />
                    <span className="input-group__suffix">jours</span>
                  </div>
                  <p className="field__hint">
                    Au-delà, les créneaux ne sont pas proposés.
                  </p>
                </div>
              </div>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}
