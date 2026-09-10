import Link from "next/link";
import { api } from "@/lib/api";
import { isoDatePlus, todayIn } from "@/lib/format";
import { Icon } from "@/components/icon";
import { EmptyState, Notice } from "@/components/ui";
import type {
  ClosureList,
  CurrentMember,
  OpeningHours,
  ProviderProfile,
  StaffList,
} from "@/lib/types";
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

/** The dialog the panel head opens. */
const CLOSURE_DIALOG = "dlg-closure";

/**
 * The three kinds, in the order they compose.
 *
 * <p>That order IS the feature: several entries may share one date; a closure
 * beats everything; exceptional hours replace the week and add to each other;
 * and an absence is taken out of whatever is left. "Je m'absente jeudi de 14 h
 * à 15 h" is the third one, and it used to require closing the whole Thursday.
 *
 * <p>The design's own dialog declares a closure and nothing else. `kind` is
 * required by `POST /v1/closures`, so the choice is asked rather than guessed.
 */
const KINDS = [
  {
    value: "TIME_OFF",
    label: "Absence sur une plage",
    hint: "La journée reste ouverte, cette plage seule est retirée.",
    icon: "hourglass",
  },
  {
    value: "CUSTOM_HOURS",
    label: "Horaires exceptionnels",
    hint: "Remplace la semaine type ce jour-là. Plusieurs sont possibles.",
    icon: "clock",
  },
  {
    value: "CLOSED",
    label: "Fermé toute la journée",
    hint: "L’emporte sur tout le reste ce jour-là.",
    icon: "calendar-x",
  },
];

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire modifie les horaires d’un collègue. Vous pouvez changer les vôtres.",
  VALIDATION_FAILED:
    "Une journée fermée ne porte pas d’heures ; une absence et des horaires exceptionnels en demandent deux.",
  RESOURCE_NOT_FOUND: "Cette personne ou cette exception n’existe plus.",
  // Ours, not the API's. A day ticked open with "--" in its lists is somebody
  // who meant to open it and has not said when; storing that as a closed day
  // would be answering a question they did not ask.
  HOURS_DAY_WITHOUT_TIMES:
    "Une journée cochée doit porter une heure d’ouverture et une heure de fermeture. Décochez-la pour la fermer.",
};

/**
 * A time out of the query string, in the two halves the lists post.
 *
 * <p>The mirror of `timeOf` in actions.ts: `TimeField` emits `<name>_h` and
 * `<name>_m`, and a GET form puts both in the address under those same names.
 * Half a time is no time, exactly as it is on submit.
 */
function queryTime(query: Record<string, string | undefined>, name: string): string {
  const hour = query[`${name}_h`] ?? "";
  const minute = query[`${name}_m`] ?? "";
  // Two digits each, or nothing. A query string is typed by anybody, and a
  // value from here is rendered straight back into a select.
  if (!/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute)) return "";
  if (Number(hour) > 23 || Number(minute) > 59) return "";
  return `${hour}:${minute}`;
}

/** The stack's gap, written the way the design writes it. */
const gap = (value: string) => ({ "--stack-gap": value }) as React.CSSProperties;

/** One day row of the week, as the design draws it. */
const ROW: React.CSSProperties = {
  padding: "var(--s-4) 0",
  borderBottom: "1px dashed var(--border)",
  gap: "var(--s-4)",
  flexWrap: "wrap",
};

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
  const [me, team, profile] = await Promise.all([
    api<CurrentMember>("/v1/me"),
    api<StaffList>("/v1/staff"),
    // For the slug alone, which the aside's link needs and no other call here
    // carries.
    api<ProviderProfile>("/v1/provider-profile"),
  ]);

  const staffId = query.staff ?? me.staff_id;
  // The date it is AT THE SALON, not on this server and not in UTC. It bounds
  // the calendar below, and read in the wrong zone it would refuse a provider
  // the one day they most often need to change: the one they are standing in.
  const today = todayIn(profile.timezone);
  const horizon = isoDatePlus(today, 90);

  const [hours, closures] = await Promise.all([
    api<OpeningHours>("/v1/opening-hours", { query: { staff_id: staffId } }),
    api<ClosureList>("/v1/closures", {
      query: { staff_id: staffId, from: today, to: horizon },
    }),
  ]);

  const byDay = new Map(hours.data.map((s) => [s.day_of_week, s]));

  // "Appliquer a toute la semaine", and the reason it travels in the address.
  //
  // Filling seven days by hand is twenty-eight lists, and a provider open the
  // same hours six days a week did all of it. This carries one pair instead -
  // but it must not SAVE, or the person would be made to store a week they do
  // not want on the way to the one they do. So the button is a GET: it writes
  // the pair into the query, the week below renders with it, and nothing has
  // changed anywhere until Enregistrer. Which also means the address is the
  // whole state, so a reload or a back button lands exactly where it was.
  //
  // Same shape as the staff selector in the aside, which is already a GET form
  // for the same reason.
  const template = queryTime(query, "all_start") && queryTime(query, "all_end")
    ? { start: queryTime(query, "all_start"), end: queryTime(query, "all_end") }
    : null;

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
            <h1 className="appbar__title">Horaires</h1>
            <div className="appbar__sub">La base de calcul de tous vos créneaux</div>
          </div>
          <div className="appbar__actions">
            <button className="btn btn--primary btn--sm" type="submit" form={WEEK_FORM}>
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
                {/* A GET, and outside the week's form because a form cannot
                    contain another. It saves nothing: it puts one pair of
                    hours in the address and the seven rows below render with
                    it, every day ticked. The provider then unticks Sunday and
                    presses Enregistrer once. */}
                <form
                  method="get"
                  action="/dashboard/hours"
                  className="card__body"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <input type="hidden" name="staff" value={staffId} />
                  <div
                    className="row row--between"
                    style={{ gap: "var(--s-4)", flexWrap: "wrap" }}
                  >
                    <span className="t-sm t-strong week-day__name">
                      Toute la semaine
                    </span>
                    <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                      <TimeField name="all_start" value={template?.start} label="Ouverture, toute la semaine" />
                      <span className="t-xs">à</span>
                      <TimeField name="all_end" value={template?.end} label="Fermeture, toute la semaine" />
                      <button className="btn btn--secondary btn--sm" type="submit">
                        <span className="btn__label--idle">Appliquer</span>
                      </button>
                    </div>
                  </div>
                  <p className="field__hint" style={{ marginTop: "var(--s-3)" }}>
                    <Icon name="info" size={16} /> Remplit les sept jours sans rien
                    enregistrer. Décochez ensuite ceux que vous ne travaillez pas.
                  </p>
                </form>

                {/* The week is replaced whole, so every day is posted: a day
                    left empty is a day of rest, stated rather than guessed. */}
                <form action={replaceHours} id={WEEK_FORM}>
                  <div className="card__body">
                    <input type="hidden" name="staff_id" value={staffId} />
                    {/* Which shape this form is, so the action can tell a day
                        nobody ticked from a form that has no ticks to give.
                        Without it, a page left open across a deployment would
                        post no `open` at all and the action would read that as
                        "every day closed" - and wipe the week of somebody who
                        pressed Enregistrer on a screen that looked normal. */}
                    <input type="hidden" name="week_form" value="ticked" />
                    {DAYS.map(([day, label]) => {
                      const segment = byDay.get(day);
                      // The template wins over what is stored: applying it is
                      // a request to see the whole week as that pair, and a
                      // day it did not touch would make the button a liar.
                      const start = template?.start ?? segment?.start_time;
                      const end = template?.end ?? segment?.end_time;
                      const open = template ? true : Boolean(segment);
                      return (
                        <div className="row row--between week-day" key={day} style={ROW}>
                          {/* The day's name IS the tick. Closing a Sunday used
                              to mean putting four lists back to "--" on a
                              telephone; it is one tap now, and "open" stops
                              being something the reader has to infer from two
                              empty boxes. */}
                          <label className="check week-day__name">
                            <input
                              type="checkbox"
                              name="open"
                              value={day}
                              defaultChecked={open}
                            />
                            <span className="check__box">
                              <Icon name="check" />
                            </span>
                            <span className="check__text t-strong">{label}</span>
                          </label>
                          <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                            <TimeField
                              name={`start_${day}`}
                              value={start}
                              label={`Ouverture ${label}`}
                            />
                            <span className="t-xs">à</span>
                            <TimeField
                              name={`end_${day}`}
                              value={end}
                              label={`Fermeture ${label}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {/* The design closes a day with a switch, and this is
                        that switch: a tick, posted as a name the action reads.
                        The week used to be posted as times alone, so two empty
                        lists were what closed a day - which worked and had to
                        be explained in a sentence underneath, because an empty
                        field that means something always does. */}
                    <p className="field__hint" style={{ marginTop: "var(--s-4)" }}>
                      <Icon name="info" size={16} /> Une journée décochée est une
                      journée de repos&nbsp;: elle ne propose aucun créneau.
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
                  <button
                    className="btn btn--secondary btn--sm"
                    type="button"
                    data-dialog-open={CLOSURE_DIALOG}
                  >
                    <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                      <Icon name="calendar-x" size={18} />
                    </span>
                    <span className="btn__label--idle">Déclarer une fermeture</span>
                  </button>
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
                            style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                          >
                            <Icon name="calendar-x" />
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
                            {/* Whose week this is, so the refusal and the
                                confirmation both land back on it. */}
                            <input type="hidden" name="staff_id" value={staffId} />
                            <button
                              className="btn btn--ghost btn--sm btn--icon"
                              type="submit"
                              aria-label="Supprimer"
                            >
                              <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                                <Icon name="trash" size={18} />
                              </span>
                            </button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <aside className="sticky-aside" style={{ display: "grid", gap: "var(--s-5)" }}>
              {/* Opening hours belong to a person here, not to the shop, so the
                  screen has to say whose week it is showing. */}
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
                        {/* Choosing IS the request. A person picked and then a
                            button pressed asks the same question twice, and the
                            second half is the half people forget. The button
                            below stays for a browser running no script, and
                            hides itself the moment one is running. */}
                        <select
                          className="select"
                          id="c-staff"
                          name="staff"
                          defaultValue={staffId}
                          data-submit-on-change
                        >
                          {team.data.map((p) => (
                            <option key={p.staff_id} value={p.staff_id}>
                              {p.display_name}
                              {p.staff_id === me.staff_id ? " (moi)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="js-none" style={{ marginTop: "var(--s-4)" }}>
                        <button className="btn btn--secondary btn--block" type="submit">
                          <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                            <Icon name="arrow-right" size={18} />
                          </span>
                          <span className="btn__label--idle">Afficher</span>
                        </button>
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
                    créneaux libres</strong> sont proposés à la réservation :
                    personne ne peut voir ce que vous faites de votre journée.
                  </p>
                  {/* Only while the page exists: it resolves through a
                      published-only lookup, and this button on an unpublished
                      business opened a 404. */}
                  {profile.published ? (
                    <div style={{ marginTop: "var(--s-5)" }}>
                      <Link className="btn btn--secondary btn--block" href={`/p/${profile.slug}`}>
                        <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                          <Icon name="external" size={18} />
                        </span>
                        <span className="btn__label--idle">Voir ma page publique</span>
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>

          <dialog className="dialog" id={CLOSURE_DIALOG}>
            <div className="dialog__inner">
              <div className="dialog__head">
                <h2 className="dialog__title">Déclarer une fermeture</h2>
              </div>
              <form action={addClosure}>
                <input type="hidden" name="staff_id" value={staffId} />
                <div className="dialog__body">
                  {/* Asked, because `POST /v1/closures` requires it and the
                      three compose differently. The design's dialog knows only
                      the closed day. */}
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
                        Le
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
                        min={today}
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
                        type="text"
                        id="c-reason"
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
                      <TimeField name="start_time" label="Début" />
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="c-end">
                        Fin
                      </label>
                      <TimeField name="end_time" label="Fin" />
                    </div>
                  </div>

                  <div style={{ marginTop: "var(--s-4)" }}>
                    <Notice tone="warning" title="Vos rendez-vous ne sont pas annulés">
                      Ils ne seront pas annulés automatiquement. Prévenez ces
                      clientes avant de valider.
                    </Notice>
                  </div>
                </div>
                <div className="dialog__foot">
                  <button className="btn btn--secondary" type="button" data-dialog-close>
                    <span className="btn__label--idle">Annuler</span>
                  </button>
                  <button className="btn btn--primary" type="submit">
                    <span className="btn__label--idle">Déclarer la fermeture</span>
                  </button>
                </div>
              </form>
            </div>
          </dialog>
        </div>
      </main>
    </>
  );
}

/**
 * An hour of the day, as two lists rather than one time field.
 *
 * <p>`<input type="time">` decides for the reader. Type "1" for ten o'clock,
 * pause, and the browser rules that the hour was "01" and moves on to the
 * minutes - so a provider who does not type both digits quickly enough sets a
 * time they did not mean, and nothing tells them. That is native behaviour, not
 * something styling can reach, and the owner hit it.
 *
 * <p>Two selects have no such timer. They are also the better control on the
 * telephone this product is used on: Android opens a native list with rows big
 * enough for a thumb, where the time field offers a spinner the width of a
 * fingernail. Minutes go in fives - a salon opens at a quarter past, never at
 * 08:07 - and the hour keeps all twenty-four.
 *
 * <p>No JavaScript: two named fields that the server action puts back together,
 * so the form still works before hydration and without it.
 */
function TimeField({
  name,
  value,
  label,
}: {
  name: string;
  value?: string | null;
  label: string;
}) {
  // The API sends "08:00:00"; a select needs its option value exactly.
  const [hour = "", minute = ""] = (value ?? "").split(":");
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="row" style={{ gap: "var(--s-1)" }}>
      <select
        className="input"
        name={`${name}_h`}
        defaultValue={hour}
        style={{ width: 76, minHeight: 42 }}
        aria-label={`${label}, heure`}
      >
        <option value="">--</option>
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={pad(h)}>
            {pad(h)}
          </option>
        ))}
      </select>
      <span aria-hidden="true">:</span>
      <select
        className="input"
        name={`${name}_m`}
        defaultValue={minute}
        style={{ width: 76, minHeight: 42 }}
        aria-label={`${label}, minutes`}
      >
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i} value={pad(i * 5)}>
            {pad(i * 5)}
          </option>
        ))}
      </select>
    </span>
  );
}
