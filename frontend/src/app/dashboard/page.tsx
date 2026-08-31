import { api } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import type {
  AppointmentPage,
  CurrentMember,
  ProviderProfile,
  ServiceOfferingPage,
  StaffList,
} from "@/lib/types";
import { bookWalkIn, cancel, complete, confirm, markNoShow, reschedule } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  PENDING: "a confirmer",
  CONFIRMED: "confirme",
  CANCELLED: "annule",
  COMPLETED: "termine",
  NO_SHOW: "non honore",
};

const REFUSALS: Record<string, string> = {
  SLOT_UNAVAILABLE: "Cette chaise est deja prise a cette heure-la.",
  VALIDATION_FAILED: "Verifiez le nom, le numero et l'heure.",
  RESOURCE_NOT_FOUND: "Cette prestation ou cette personne n'existe plus.",
  INVALID_STATE_TRANSITION: "Ce rendez-vous a deja change entre-temps. Rechargez la page.",
  // Deplacer obeit aux horaires publies, contrairement a une saisie au
  // comptoir : celle-ci enregistre ce qui se passe, celui-la planifie.
  SLOT_OUTSIDE_AVAILABILITY:
    "Personne ne travaille a cette heure-la sur cette chaise. Donnez d'abord des horaires a cette personne, ou choisissez une autre heure.",
  RATE_LIMITED: "Trop de demandes en meme temps. Reessayez dans un instant.",
};

/**
 * The diary.
 *
 * <p>Every row says whose chair it is, which the agenda could not do until
 * staff_id was projected: a salon with five chairs got one undifferentiated
 * stream. The filters are a GET form, so a day view is a URL somebody can
 * bookmark and go back to.
 */
export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; staff?: string; error?: string }>;
}) {
  const query = await searchParams;

  const [provider, me, team, services] = await Promise.all([
    api<ProviderProfile>("/v1/provider-profile"),
    api<CurrentMember>("/v1/me"),
    api<StaffList>("/v1/staff"),
    api<ServiceOfferingPage>("/v1/service-offerings", { query: { active: true, limit: 100 } }),
  ]);

  const appointments = await api<AppointmentPage>("/v1/appointments", {
    query: {
      // Omitted means "from now", which is what opening a dashboard means.
      from: query.from ? new Date(query.from).toISOString() : undefined,
      to: query.to ? new Date(query.to).toISOString() : undefined,
      staff_id: query.staff || undefined,
      limit: 100,
    },
  });

  const zone = provider.timezone;
  const bookable = team.data.filter((person) => person.active);

  return (
    <main>
      <h2>Agenda</h2>

      {query.error ? (
        <p className="problem">{REFUSALS[query.error] ?? "La demande n'a pas abouti."}</p>
      ) : null}

      <form method="get">
        <div className="row">
          <label>
            Du
            <input type="datetime-local" name="from" defaultValue={query.from ?? ""} />
          </label>
          <label>
            Au
            <input type="datetime-local" name="to" defaultValue={query.to ?? ""} />
          </label>
          <label>
            Chaise
            <select name="staff" defaultValue={query.staff ?? ""}>
              <option value="">Toute l'equipe</option>
              {team.data.map((person) => (
                <option key={person.staff_id} value={person.staff_id}>
                  {person.display_name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Afficher</button>
        </div>
      </form>

      {appointments.data.length === 0 ? (
        <p>Aucun rendez-vous sur cette periode.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Quand</th>
              <th>Qui</th>
              <th>Chaise</th>
              <th>Prestation</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {appointments.data.map((appointment) => (
              <tr key={appointment.appointment_id}>
                <td>{dateTime(appointment.starts_at, zone)}</td>
                <td>
                  {appointment.customer.full_name}
                  <br />
                  {appointment.customer.phone}
                  {appointment.customer_note ? (
                    <>
                      <br />
                      <em>{appointment.customer_note}</em>
                    </>
                  ) : null}
                </td>
                <td>{appointment.staff_name}</td>
                <td>
                  {appointment.service_name}
                  <br />
                  {money(appointment.price)}
                </td>
                <td>{STATUS[appointment.status] ?? appointment.status}</td>
                <td>
                  <Actions
                    id={appointment.appointment_id}
                    status={appointment.status}
                    staffId={appointment.staff_id}
                    startsAt={appointment.starts_at}
                    zone={zone}
                    team={bookable}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Inscrire quelqu'un au comptoir</h2>
      <p>
        Les horaires publies et le delai de prevenance ne s'appliquent pas ici :
        c'est votre carnet. La seule chose qui reste refusee, c'est deux
        personnes sur la meme chaise a la meme heure.
      </p>
      <form action={bookWalkIn}>
        <div className="row">
          <label>
            Prestation
            <select name="service_offering_id" required>
              {services.data.map((one) => (
                <option key={one.service_offering_id} value={one.service_offering_id}>
                  {one.name} — {one.duration_minutes} min
                </option>
              ))}
            </select>
          </label>
          <label>
            Chaise
            <select name="staff_id" required defaultValue={me.staff_id}>
              {bookable.map((person) => (
                <option key={person.staff_id} value={person.staff_id}>
                  {person.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quand
            <input type="datetime-local" name="starts_at" required />
          </label>
        </div>
        <div className="row">
          <label>
            Nom du client
            <input type="text" name="full_name" required maxLength={120} />
          </label>
          <label>
            Telephone
            <input type="tel" name="phone" required maxLength={24} />
          </label>
          <button type="submit">Inscrire</button>
        </div>
      </form>
    </main>
  );
}

/**
 * What can still happen to one appointment.
 *
 * <p>Only the transitions the state machine accepts are offered. A terminal
 * appointment shows nothing: a button the server would refuse teaches a
 * provider that the dashboard is unreliable.
 */
function Actions({
  id,
  status,
  staffId,
  startsAt,
  zone,
  team,
}: {
  id: string;
  status: string;
  staffId: string;
  startsAt: string;
  zone: string;
  team: { staff_id: string; display_name: string }[];
}) {
  const open = status === "PENDING" || status === "CONFIRMED";
  if (!open) return null;

  return (
    <>
      {status === "PENDING" ? (
        <form action={confirm}>
          <input type="hidden" name="id" value={id} />
          <button type="submit">Confirmer</button>
        </form>
      ) : (
        <>
          <form action={complete}>
            <input type="hidden" name="id" value={id} />
            <button type="submit">Termine</button>
          </form>
          <form action={markNoShow}>
            <input type="hidden" name="id" value={id} />
            <button type="submit">Non honore</button>
          </form>
        </>
      )}

      <form action={reschedule}>
        <input type="hidden" name="id" value={id} />
        <input
          type="datetime-local"
          name="starts_at"
          defaultValue={localInput(startsAt, zone)}
          required
        />
        <select name="staff_id" defaultValue={staffId}>
          {team.map((person) => (
            <option key={person.staff_id} value={person.staff_id}>
              {person.display_name}
            </option>
          ))}
        </select>
        <button type="submit">Deplacer</button>
      </form>

      <form action={cancel}>
        <input type="hidden" name="id" value={id} />
        <input type="text" name="reason" placeholder="motif" maxLength={200} />
        <button type="submit">Annuler</button>
      </form>
    </>
  );
}

/**
 * What a datetime-local input wants: the provider's own wall clock, with no
 * offset. Built from the parts rather than from toISOString, which would give
 * the server's idea of local time - and a salon in Conakry read on a laptop set
 * to Paris would be offered every appointment an hour out.
 */
function localInput(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instant));
  return parts.replace(" ", "T");
}
