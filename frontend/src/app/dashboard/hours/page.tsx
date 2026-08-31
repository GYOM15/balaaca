import { api } from "@/lib/api";
import { isoDate } from "@/lib/format";
import type { ClosureList, CurrentMember, OpeningHours, StaffList } from "@/lib/types";
import { addClosure, removeClosure, replaceHours } from "./actions";

export const dynamic = "force-dynamic";

const DAYS = [
  [1, "Lundi"],
  [2, "Mardi"],
  [3, "Mercredi"],
  [4, "Jeudi"],
  [5, "Vendredi"],
  [6, "Samedi"],
  [7, "Dimanche"],
] as const;

const KINDS: Record<string, string> = {
  CLOSED: "Ferme toute la journee",
  CUSTOM_HOURS: "Horaires exceptionnels",
  TIME_OFF: "Absence sur une plage",
};

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le proprietaire peut modifier les horaires d'un collegue.",
  VALIDATION_FAILED: "Une journee fermee ne porte pas d'heures ; les deux autres en demandent deux.",
};

/**
 * When somebody works, and when they do not.
 *
 * <p>Per person, because a schedule belongs to a person: a salon where one
 * stylist works Saturdays and another does not is the ordinary case. An
 * employee reads a colleague's week and changes only their own, which is what
 * the API enforces - this page just picks whose week to show.
 */
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
  const in90 = new Date(today.getTime() + 90 * 86_400_000);

  const [hours, closures] = await Promise.all([
    api<OpeningHours>("/v1/opening-hours", { query: { staff_id: staffId } }),
    api<ClosureList>("/v1/closures", {
      query: { staff_id: staffId, from: isoDate(today), to: isoDate(in90) },
    }),
  ]);

  const byDay = new Map(hours.data.map((segment) => [segment.day_of_week, segment]));

  return (
    <main>
      <h2>Horaires</h2>

      {query.error ? (
        <p className="problem">{REFUSALS[query.error] ?? "La demande n'a pas abouti."}</p>
      ) : null}

      <form method="get">
        <div className="row">
          <label>
            De qui
            <select name="staff" defaultValue={staffId}>
              {team.data.map((person) => (
                <option key={person.staff_id} value={person.staff_id}>
                  {person.display_name}
                  {person.staff_id === me.staff_id ? " (moi)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Afficher</button>
        </div>
      </form>

      <h3>Semaine type ({hours.timezone})</h3>
      <p>
        La semaine est enregistree en entier. Une journee laissee vide est une
        journee de repos&nbsp;: c'est dit, pas devine.
      </p>
      <form action={replaceHours}>
        <input type="hidden" name="staff_id" value={staffId} />
        {DAYS.map(([day, label]) => (
          <div className="row" key={day}>
            <label>
              {label} — debut
              <input type="time" name={`start_${day}`} defaultValue={byDay.get(day)?.start_time ?? ""} />
            </label>
            <label>
              fin
              <input type="time" name={`end_${day}`} defaultValue={byDay.get(day)?.end_time ?? ""} />
            </label>
          </div>
        ))}
        <button type="submit">Enregistrer la semaine</button>
      </form>

      <h3>Exceptions</h3>
      {closures.data.length === 0 ? (
        <p>Aucune exception dans les 90 prochains jours.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Quoi</th>
              <th>Heures</th>
              <th>Motif</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {closures.data.map((closure) => (
              <tr key={closure.closure_id}>
                <td>{closure.date}</td>
                <td>{KINDS[closure.kind] ?? closure.kind}</td>
                <td>
                  {closure.start_time ? `${closure.start_time} – ${closure.end_time}` : "—"}
                </td>
                <td>{closure.reason ?? "—"}</td>
                <td>
                  <form action={removeClosure}>
                    <input type="hidden" name="id" value={closure.closure_id} />
                    <button type="submit">Supprimer</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p>
        Plusieurs exceptions peuvent porter la meme date. Une fermeture l'emporte
        sur tout&nbsp;; des horaires exceptionnels remplacent la semaine type et
        s'additionnent entre eux&nbsp;; une absence se retire de ce qu'il reste.
      </p>
      <form action={addClosure}>
        <input type="hidden" name="staff_id" value={staffId} />
        <div className="row">
          <label>
            Date
            <input type="date" name="date" required />
          </label>
          <label>
            Quoi
            <select name="kind" defaultValue="TIME_OFF">
              {Object.entries(KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Debut
            <input type="time" name="start_time" />
          </label>
          <label>
            Fin
            <input type="time" name="end_time" />
          </label>
          <label>
            Motif
            <input type="text" name="reason" maxLength={200} />
          </label>
          <button type="submit">Ajouter</button>
        </div>
      </form>
    </main>
  );
}
