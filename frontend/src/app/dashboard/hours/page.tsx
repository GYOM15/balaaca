import { api } from "@/lib/api";
import { isoDate } from "@/lib/format";
import { Icon } from "@/components/icon";
import { ActionButton, Badge, EmptyState, Notice, SectionHead } from "@/components/ui";
import type { ClosureList, CurrentMember, OpeningHours, StaffList } from "@/lib/types";
import { addClosure, removeClosure, replaceHours } from "./actions";

export const dynamic = "force-dynamic";

const DAYS = [
  [1, "Lundi"], [2, "Mardi"], [3, "Mercredi"], [4, "Jeudi"],
  [5, "Vendredi"], [6, "Samedi"], [7, "Dimanche"],
] as const;

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
  { value: "TIME_OFF", label: "Absence sur une plage", hint: "La journée reste ouverte, cette plage seule est retirée.", tone: "warning" as const },
  { value: "CUSTOM_HOURS", label: "Horaires exceptionnels", hint: "Remplace la semaine type ce jour-là. Plusieurs sont possibles.", tone: "info" as const },
  { value: "CLOSED", label: "Fermé toute la journée", hint: "L'emporte sur tout le reste ce jour-là.", tone: "neutral" as const },
];

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire modifie les horaires d'un collègue. Vous pouvez changer les vôtres.",
  VALIDATION_FAILED:
    "Une journée fermée ne porte pas d'heures ; une absence et des horaires exceptionnels en demandent deux.",
  RESOURCE_NOT_FOUND: "Cette personne ou cette exception n'existe plus.",
};

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

  return (
    <div className="stack stack-8">
      <header className="pro-head">
        <h1 className="pro-head__title">Horaires</h1>
        <p className="t-small t-muted">
          {mine ? "Votre semaine" : `La semaine de ${person?.display_name ?? "cette personne"}`}
          {" — heures de "}
          <span className="tnum">{hours.timezone.split("/").pop()?.replace("_", " ")}</span>
        </p>
      </header>

      {query.error ? (
        <Notice tone="danger" title="La modification n'a pas abouti">
          {REFUSALS[query.error] ?? "Réessayez, ou rechargez la page."}
        </Notice>
      ) : null}

      {team.data.length > 1 ? (
        <form method="get" className="card card--pad stack stack-3">
          <label className="field">
            <span className="field__label">De qui</span>
            <select className="select" name="staff" defaultValue={staffId}>
              {team.data.map((p) => (
                <option key={p.staff_id} value={p.staff_id}>
                  {p.display_name}
                  {p.staff_id === me.staff_id ? " (moi)" : ""}
                </option>
              ))}
            </select>
          </label>
          <ActionButton label="Afficher" variant="secondary" type="submit" icon="arrow-right" />
        </form>
      ) : null}

      {/* --- La semaine type --- */}
      <section className="stack stack-4">
        <SectionHead label="Semaine type" />
        <p className="t-small t-muted measure">
          La semaine s'enregistre en entier. Une journée laissée vide est une
          journée de repos&nbsp;: c'est dit, pas deviné.
        </p>

        <form action={replaceHours} className="card card--pad-lg stack stack-4">
          <input type="hidden" name="staff_id" value={staffId} />
          <div className="stack stack-2">
            {DAYS.map(([day, label]) => {
              const segment = byDay.get(day);
              return (
                <div className="oh-row" key={day}>
                  <span className="oh-row__day">{label}</span>
                  <div className="oh-times">
                    <input
                      className="input"
                      type="time"
                      name={`start_${day}`}
                      defaultValue={segment?.start_time ?? ""}
                      aria-label={`${label}, heure d'ouverture`}
                    />
                    <span className="t-dim" aria-hidden="true">–</span>
                    <input
                      className="input"
                      type="time"
                      name={`end_${day}`}
                      defaultValue={segment?.end_time ?? ""}
                      aria-label={`${label}, heure de fermeture`}
                    />
                  </div>
                  {segment ? null : <span className="t-caption t-dim">repos</span>}
                </div>
              );
            })}
          </div>
          <div className="row row-3 row--wrap">
            <ActionButton
              label="Enregistrer la semaine"
              variant="primary"
              type="submit"
              icon="check"
            />
          </div>
        </form>
      </section>

      {/* --- Les exceptions --- */}
      <section className="stack stack-4">
        <SectionHead
          label="Exceptions"
          aside={closures.data.length > 0 ? `${closures.data.length} à venir` : undefined}
        />
        <p className="t-small t-muted measure">
          Plusieurs exceptions peuvent porter la même date. Une fermeture
          l'emporte sur tout&nbsp;; des horaires exceptionnels remplacent la
          semaine type et s'additionnent entre eux&nbsp;; une absence se retire
          de ce qu'il reste.
        </p>

        {closures.data.length === 0 ? (
          <EmptyState
            compact
            sketch="notebook"
            title="Aucune exception dans les 90 prochains jours"
            body="Votre semaine type s'applique telle quelle."
          />
        ) : (
          <ul className="list list--boxed">
            {closures.data.map((c) => {
              const kind = KINDS.find((k) => k.value === c.kind);
              return (
                <li key={c.closure_id}>
                  <div className="list-row">
                    <div className="grow stack stack-1">
                      <div className="row row-2 row--wrap">
                        <span className="t-small tnum">{c.date}</span>
                        <Badge label={kind?.label ?? c.kind} tone={kind?.tone ?? "neutral"} />
                      </div>
                      <span className="t-caption t-dim">
                        {c.start_time ? (
                          <span className="tnum">
                            {c.start_time} – {c.end_time}
                          </span>
                        ) : (
                          "toute la journée"
                        )}
                        {c.reason ? ` · ${c.reason}` : ""}
                      </span>
                    </div>
                    <form action={removeClosure}>
                      <input type="hidden" name="id" value={c.closure_id} />
                      <ActionButton
                        label="Supprimer"
                        variant="quiet-danger"
                        size="sm"
                        type="submit"
                        icon="trash"
                      />
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form action={addClosure} className="card card--pad-lg stack stack-4">
          <input type="hidden" name="staff_id" value={staffId} />
          <p className="t-label">Ajouter une exception</p>

          <fieldset className="stack stack-2" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label">Quoi</legend>
            {KINDS.map((k, i) => (
              <label className="choice" key={k.value}>
                <input type="radio" name="kind" value={k.value} defaultChecked={i === 0} />
                <span className="grow">
                  <span className="t-small">{k.label}</span>
                  <span className="field__hint" style={{ display: "block" }}>
                    {k.hint}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="row row-3 row--wrap row--top">
            <label className="field grow">
              <span className="field__label">
                Date<span className="field__req" aria-hidden="true">*</span>
              </span>
              <input className="input" type="date" name="date" required min={isoDate(today)} />
            </label>
            <label className="field">
              <span className="field__label">Début</span>
              <input className="input" type="time" name="start_time" />
            </label>
            <label className="field">
              <span className="field__label">Fin</span>
              <input className="input" type="time" name="end_time" />
            </label>
          </div>
          <p className="field__hint">
            <Icon name="info" size={14} /> Une journée fermée ne porte pas
            d'heures&nbsp;; les deux autres en demandent deux.
          </p>

          <label className="field">
            <span className="field__label">Motif</span>
            <input
              className="input"
              type="text"
              name="reason"
              maxLength={200}
              placeholder="Rendez-vous médical, fête, formation…"
            />
            <span className="field__hint">Pour vous. Aucun client ne le lit.</span>
          </label>

          <ActionButton label="Ajouter" variant="secondary" type="submit" icon="plus" />
        </form>
      </section>
    </div>
  );
}
