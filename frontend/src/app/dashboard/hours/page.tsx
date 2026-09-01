import { api } from "@/lib/api";
import { isoDate } from "@/lib/format";
import { Icon } from "@/components/icon";
import { ActionButton, Badge, EmptyState, Notice } from "@/components/ui";
import type { ClosureList, CurrentMember, OpeningHours, StaffList } from "@/lib/types";
import { addClosure, removeClosure, replaceHours } from "./actions";

export const dynamic = "force-dynamic";

const DAYS = [
  [1, "Lundi"], [2, "Mardi"], [3, "Mercredi"], [4, "Jeudi"],
  [5, "Vendredi"], [6, "Samedi"], [7, "Dimanche"],
] as const;

/**
 * The week's own form, submitted from the bar at the top of the screen.
 *
 * <p>`form` is what binds a button to a form it is not nested in - native, so
 * the submission works with no JavaScript at all.
 */
const WEEK_FORM = "week-form";

/**
 * The three kinds, in the order they compose.
 *
 * <p>That order IS the feature, and it is what the schedule could not express
 * before: several entries may share one date; a closure beats everything;
 * exceptional hours replace the week and add to each other; and an absence is
 * taken out of whatever is left. "Je m'absente jeudi de 14 h à 15 h" is the
 * third one, and it used to require closing the whole Thursday.
 */
const KINDS = [
  {
    value: "TIME_OFF",
    label: "Absence sur une plage",
    hint: "La journée reste ouverte, cette plage seule est retirée.",
    tone: "warning" as const,
    icon: "hourglass",
    bg: "var(--warning-bg)",
    fg: "var(--warning)",
  },
  {
    value: "CUSTOM_HOURS",
    label: "Horaires exceptionnels",
    hint: "Remplace la semaine type ce jour-là. Plusieurs sont possibles.",
    tone: "info" as const,
    icon: "clock",
    bg: "var(--info-bg)",
    fg: "var(--info)",
  },
  {
    value: "CLOSED",
    label: "Fermé toute la journée",
    hint: "L'emporte sur tout le reste ce jour-là.",
    tone: "neutral" as const,
    icon: "calendar-x",
    bg: "var(--bg-sunken)",
    fg: "var(--text-tertiary)",
  },
];

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire modifie les horaires d'un collègue. Vous pouvez changer les vôtres.",
  VALIDATION_FAILED:
    "Une journée fermée ne porte pas d'heures ; une absence et des horaires exceptionnels en demandent deux.",
  RESOURCE_NOT_FOUND: "Cette personne ou cette exception n'existe plus.",
};

/** The stack's gap, written the way the mockup writes it. */
const gap = (value: string) => ({ "--stack-gap": value }) as React.CSSProperties;

/**
 * A plain date, read as a date.
 *
 * <p>UTC on purpose: `2026-10-02` is a calendar day and not a moment, so
 * reading it in any other zone would print the day before for half the world.
 */
const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeZone: "UTC" });

export default async function Hours({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string; error?: string }>;
}) {
  const query = await searchParams;
  const [me, team] = await Promise.all([
    api<CurrentMember>("/v1/me"),
    api<StaffList>("/v1/staff"),
  ]);

  const staffId = query.staff ?? me.staff_id;
  const today = new Date();
  const horizon = new Date(today.getTime() + 90 * 86_400_000);

  const [hours, closures] = await Promise.all([
    api<OpeningHours>("/v1/opening-hours", { query: { staff_id: staffId } }),
    api<ClosureList>("/v1/closures", {
      query: { staff_id: staffId, from: isoDate(today), to: isoDate(horizon) },
    }),
  ]);

  const byDay = new Map(hours.data.map((s) => [s.day_of_week, s]));
  const mine = staffId === me.staff_id;
  const person = team.data.find((p) => p.staff_id === staffId);
  const zone = hours.timezone.split("/").pop()?.replace("_", " ");

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <div>
            <h1 className="appbar__title">Horaires</h1>
            <div className="appbar__sub">
              {mine ? "Votre semaine" : `La semaine de ${person?.display_name ?? "cette personne"}`}
              {" · heures de "}
              {zone}
            </div>
          </div>
          <div className="appbar__actions">
            <button className="btn btn--primary btn--sm" type="submit" form={WEEK_FORM}>
              <Icon name="check" size={16} className="btn__icon--idle" />
              <span className="btn__label--idle">Enregistrer</span>
            </button>
          </div>
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          {query.error ? (
            <div style={{ marginBottom: "var(--s-6)" }}>
              <Notice tone="danger" title="La modification n’a pas abouti">
                {REFUSALS[query.error] ?? "Réessayez, ou rechargez la page."}
              </Notice>
            </div>
          ) : null}

          <div className="cols cols--main-aside">
            <div className="stack" style={gap("var(--s-6)")}>
              {/* --- The ordinary week --- */}
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Semaine type</div>
                    <div className="panel__sub">
                      Vos horaires habituels, valables tant qu’aucune fermeture ne
                      s’y oppose.
                    </div>
                  </div>
                </div>
                {/* The week is replaced whole, so every day is posted: a day
                    left empty is a day of rest, stated rather than guessed. */}
                <form action={replaceHours} id={WEEK_FORM}>
                  <div className="card__body">
                    <input type="hidden" name="staff_id" value={staffId} />
                    {DAYS.map(([day, label]) => {
                      const segment = byDay.get(day);
                      return (
                        <div
                          className="row row--between"
                          key={day}
                          style={{
                            padding: "var(--s-4) 0",
                            borderBottom: "1px dashed var(--border)",
                            gap: "var(--s-4)",
                            flexWrap: "wrap",
                          }}
                        >
                          <span className="t-sm t-strong" style={{ minWidth: 160 }}>
                            {label}
                          </span>
                          <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                            <input
                              className="input"
                              type="time"
                              name={`start_${day}`}
                              defaultValue={segment?.start_time ?? ""}
                              style={{ width: 154, minHeight: 42 }}
                              aria-label={`Ouverture ${label}`}
                            />
                            <span className="t-xs">à</span>
                            <input
                              className="input"
                              type="time"
                              name={`end_${day}`}
                              defaultValue={segment?.end_time ?? ""}
                              style={{ width: 154, minHeight: 42 }}
                              aria-label={`Fermeture ${label}`}
                            />
                            {segment ? null : (
                              <span className="t-sm" style={{ color: "var(--text-tertiary)" }}>
                                Fermé toute la journée
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <p className="field__hint" style={{ marginTop: "var(--s-4)" }}>
                      <Icon name="info" size={16} /> Une journée laissée vide est
                      une journée de repos&nbsp;: c’est dit, pas deviné.
                    </p>
                  </div>
                </form>
              </div>

              {/* --- The exceptions --- */}
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Fermetures et congés</div>
                    <div className="panel__sub">
                      Elles retirent les créneaux concernés, sans toucher à la
                      semaine type.
                    </div>
                  </div>
                  {closures.data.length > 0 ? (
                    <Badge label={`${closures.data.length} à venir`} tone="neutral" />
                  ) : null}
                </div>

                {closures.data.length === 0 ? (
                  <EmptyState
                    compact
                    sketch="notebook"
                    title="Aucune exception dans les 90 prochains jours"
                    body="Votre semaine type s’applique telle quelle."
                  />
                ) : (
                  <div className="list" style={{ borderTop: 0 }}>
                    {closures.data.map((c) => {
                      const kind = KINDS.find((k) => k.value === c.kind);
                      return (
                        <div className="list__item" key={c.closure_id}>
                          <span
                            className="choice__icon"
                            style={{
                              background: kind?.bg ?? "var(--bg-sunken)",
                              color: kind?.fg ?? "var(--text-tertiary)",
                            }}
                          >
                            <Icon name={kind?.icon ?? "calendar-x"} />
                          </span>
                          <div className="grow">
                            <div className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
                              {DATE.format(new Date(c.date))}
                            </div>
                            <div className="t-xs">
                              {kind?.label ?? c.kind}
                              {" · "}
                              {c.start_time ? `${c.start_time} – ${c.end_time}` : "toute la journée"}
                              {c.reason ? ` · ${c.reason}` : ""}
                            </div>
                          </div>
                          <form action={removeClosure}>
                            <input type="hidden" name="id" value={c.closure_id} />
                            <ActionButton
                              label="Supprimer"
                              variant="danger-quiet"
                              size="sm"
                              type="submit"
                              icon="trash"
                            />
                          </form>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Declared in the page rather than behind a dialog: a <dialog>
                  never opens without JavaScript, and this form is the only way
                  to close a day. */}
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Déclarer une fermeture</div>
                    <div className="panel__sub">
                      Plusieurs exceptions peuvent porter la même date.
                    </div>
                  </div>
                </div>
                <form action={addClosure}>
                  <div className="card__body">
                    <input type="hidden" name="staff_id" value={staffId} />

                    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="field__label">Quoi</legend>
                      <div className="choice-grid choice-grid--3">
                        {KINDS.map((k, i) => (
                          <label className="choice" key={k.value}>
                            <input
                              type="radio"
                              name="kind"
                              value={k.value}
                              defaultChecked={i === 0}
                            />
                            <span className="choice__mark">
                              <Icon name="check-circle" />
                            </span>
                            <span className="choice__head">
                              <span className="choice__icon">
                                <Icon name={k.icon} />
                              </span>
                              <span className="choice__title">{k.label}</span>
                            </span>
                            <span className="choice__desc">{k.hint}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <div className="cols cols--2" style={{ gap: "var(--s-4)" }}>
                      <div className="field">
                        <label className="field__label" htmlFor="c-date">
                          Date
                          <span className="field__req" aria-hidden="true">
                            *
                          </span>
                        </label>
                        <input
                          className="input"
                          id="c-date"
                          type="date"
                          name="date"
                          required
                          min={isoDate(today)}
                        />
                        <p className="field__hint">
                          Une exception porte une journée. Pour des congés,
                          déclarez chaque jour.
                        </p>
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="c-reason">
                          Motif
                          <span className="field__optional">facultatif</span>
                        </label>
                        <input
                          className="input"
                          id="c-reason"
                          type="text"
                          name="reason"
                          maxLength={200}
                          placeholder="Congés"
                        />
                        <p className="field__hint">Visible uniquement par vous.</p>
                      </div>
                    </div>

                    <div className="cols cols--2" style={{ gap: "var(--s-4)" }}>
                      <div className="field">
                        <label className="field__label" htmlFor="c-start">
                          Début
                        </label>
                        <input className="input" id="c-start" type="time" name="start_time" />
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor="c-end">
                          Fin
                        </label>
                        <input className="input" id="c-end" type="time" name="end_time" />
                      </div>
                    </div>

                    <p className="field__hint" style={{ marginTop: "var(--s-4)" }}>
                      <Icon name="info" size={16} /> Une journée fermée ne porte
                      pas d’heures&nbsp;; les deux autres en demandent deux.
                    </p>
                  </div>
                  <div className="card__foot">
                    <div className="row">
                      <span className="grow" />
                      <ActionButton
                        label="Déclarer la fermeture"
                        variant="primary"
                        type="submit"
                        icon="calendar-x"
                      />
                    </div>
                  </div>
                </form>
              </div>
            </div>

            <aside className="sticky-aside" style={{ display: "grid", gap: "var(--s-5)" }}>
              {team.data.length > 1 ? (
                <div className="panel">
                  <div className="panel__head">
                    <div className="panel__title">De qui</div>
                  </div>
                  {/* A GET form: the choice is a URL, so it can be shared and
                      reloaded. It reads nothing and writes nothing. */}
                  <form method="get">
                    <div className="card__body">
                      <div className="field">
                        <label className="field__label" htmlFor="c-staff">
                          Personne
                        </label>
                        <select className="select" id="c-staff" name="staff" defaultValue={staffId}>
                          {team.data.map((p) => (
                            <option key={p.staff_id} value={p.staff_id}>
                              {p.display_name}
                              {p.staff_id === me.staff_id ? " (moi)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginTop: "var(--s-4)" }}>
                        <ActionButton
                          label="Afficher"
                          variant="secondary"
                          block
                          type="submit"
                          icon="arrow-right"
                        />
                      </div>
                    </div>
                  </form>
                </div>
              ) : null}

              <div className="panel">
                <div className="panel__head">
                  <div className="panel__title">Effet sur vos clients</div>
                </div>
                <div className="card__body">
                  <p className="t-sm">
                    Vos horaires sont publics&nbsp;: ils s’affichent sur votre
                    page. En revanche, <strong className="t-strong">seuls les
                    créneaux libres</strong> sont proposés à la réservation&nbsp;:
                    personne ne peut voir ce que vous faites de votre journée.
                  </p>
                  <p className="t-sm" style={{ marginTop: "var(--s-4)" }}>
                    Une fermeture l’emporte sur tout&nbsp;; des horaires
                    exceptionnels remplacent la semaine type et s’additionnent
                    entre eux&nbsp;; une absence se retire de ce qu’il reste.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
