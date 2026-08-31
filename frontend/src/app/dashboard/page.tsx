import { Icon } from "@/components/icon";
import {
  ActionButton,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Notice,
  SectionHead,
  StatusBadge,
} from "@/components/ui";
import { api } from "@/lib/api";
import { day, instantFromLocal, money, time } from "@/lib/format";
import type {
  AppointmentPage,
  AppointmentView,
  CurrentMember,
  ProviderProfile,
  ServiceOfferingPage,
  StaffView,
} from "@/lib/types";
import { bookWalkIn, cancel, complete, confirm, markNoShow, reschedule } from "./actions";

/** A diary. Cached, it would be stale before it was drawn. */
export const dynamic = "force-dynamic";

/**
 * What a refusal means, in words a provider can act on.
 *
 * <p>Keyed by the contract's own closed catalogue. Every one of these is an
 * answer, not a fault: the page that renders a 500 for them says the product
 * is broken when what happened is that the answer was no.
 */
const REFUSALS: Record<string, string> = {
  SLOT_UNAVAILABLE:
    "Cette chaise est déjà prise à cette heure-là. Choisissez une autre heure, ou une autre personne.",
  INVALID_STATE_TRANSITION:
    "Ce rendez-vous a changé entre-temps — quelqu’un l’a confirmé, terminé ou annulé pendant que vous lisiez. Rechargez la page pour voir où il en est.",
  // Moving obeys the published hours; the counter does not. Saying which is
  // the difference between a rule and a bug.
  SLOT_OUTSIDE_AVAILABILITY:
    "Personne ne travaille à cette heure-là. Déplacer un rendez-vous respecte vos horaires publiés : choisissez une heure ouverte, ou ouvrez d’abord la plage dans Horaires.",
  RESOURCE_NOT_FOUND: "Ce rendez-vous, cette prestation ou cette personne n’existe plus.",
  RATE_LIMITED: "Trop de demandes en même temps. Réessayez dans un instant.",
  VALIDATION_FAILED: "Vérifiez le nom, le numéro et l’heure.",
  IDEMPOTENCY_KEY_REUSED: "Cette inscription a déjà été enregistrée. Rechargez la page.",
};

/** The states the API will still accept a verb for. */
const OPEN = new Set(["PENDING", "CONFIRMED"]);

/** What the state filter offers, in the order a provider thinks of them. */
const STATUSES: [string, string][] = [
  ["PENDING", "En attente"],
  ["CONFIRMED", "Confirmés"],
  ["COMPLETED", "Terminés"],
  ["NO_SHOW", "Absents"],
  ["CANCELLED", "Annulés"],
];

type Query = {
  from?: string;
  to?: string;
  staff?: string;
  status?: string;
  cursor?: string;
  error?: string;
};

/**
 * The diary.
 *
 * <p>Every row says whose chair it is, which the mockup's agenda could not:
 * `staff_id` is the resource key of the constraint that stops double booking
 * and it was neither returned nor filterable, so a salon with five chairs got
 * one undifferentiated stream. Here it is on the row and in the filter.
 *
 * <p>The filters are a GET form, so a day is a URL - it can be bookmarked, sent
 * to a colleague, and the back button returns to it rather than to a blank one.
 */
export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;

  const [provider, me, team, services] = await Promise.all([
    api<ProviderProfile>("/v1/provider-profile"),
    api<CurrentMember>("/v1/me"),
    api<{ data: StaffView[] }>("/v1/staff"),
    api<ServiceOfferingPage>("/v1/service-offerings", { query: { active: true, limit: 200 } }),
  ]);

  const zone = provider.timezone;
  const todayDay = today(zone);

  // Opening the dashboard means "from the start of today", not "from now": the
  // morning's appointments are exactly the ones still waiting to be marked
  // done, and a ray that starts at this minute hides every one of them.
  const fromDay = query.from?.trim() || todayDay;
  const toDay = query.to?.trim() || "";

  const [appointments, todayPage, pendingPage] = await Promise.all([
    api<AppointmentPage>("/v1/appointments", {
      query: {
        from: instantFromLocal(`${fromDay}T00:00`, zone),
        to: toDay ? instantFromLocal(`${toDay}T23:59`, zone) : undefined,
        staff_id: query.staff || undefined,
        status: query.status || undefined,
        cursor: query.cursor || undefined,
        limit: 50,
      },
    }),
    // Counted with their own calls rather than off the page above: that page is
    // filtered and paginated, so a number taken from it would answer "how many
    // are on screen", which nobody asked.
    api<AppointmentPage>("/v1/appointments", {
      query: {
        from: instantFromLocal(`${todayDay}T00:00`, zone),
        to: instantFromLocal(`${todayDay}T23:59`, zone),
        limit: 200,
      },
    }),
    api<AppointmentPage>("/v1/appointments", { query: { status: "PENDING", limit: 200 } }),
  ]);

  const bookable = team.data.filter((person) => person.active);
  const filtered = Boolean(query.to || query.staff || query.status || query.from);

  // Carried through every action so a verb pressed on Saturday's page comes
  // back to Saturday.
  const back = carry(query);

  return (
    <>
      <div className="pro-head stack stack-2">
        <h1 className="pro-head__title">Agenda</h1>
        <p className="t-small t-muted" style={{ fontWeight: 400, textTransform: "capitalize" }}>
          {day(instantFromLocal(`${todayDay}T12:00`, zone), zone)}
        </p>
      </div>

      <div className="pro-body stack stack-8" id="main">
        {query.error ? (
          <Notice tone="danger" title="La demande n’a pas abouti">
            {REFUSALS[query.error] ?? "Le serveur a refusé cette action."}
          </Notice>
        ) : null}

        <div
          className="stat-row"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
        >
          <div className="stat">
            <span className="stat__val tnum">{count(todayPage)}</span>
            <span className="stat__key">Rendez-vous aujourd’hui</span>
          </div>
          <div className={pendingPage.data.length > 0 ? "stat stat--accent" : "stat"}>
            <span className="stat__val tnum">{count(pendingPage)}</span>
            <span className="stat__key">
              À confirmer
              {pendingPage.data.length > 0 ? <Icon name="alert-circle" size={12} /> : null}
            </span>
          </div>
        </div>

        <section className="stack stack-4" aria-labelledby="filters-title">
          <SectionHead label="Filtrer" />
          <form className="card card--pad stack stack-4" method="get" action="/dashboard">
            <h2 className="t-caption t-dim" id="filters-title">
              Une période, une chaise, un état. Le résultat est une adresse&nbsp;: gardez-la.
            </h2>
            <div className="row row-3 row--wrap" style={{ alignItems: "flex-end" }}>
              <div className="field grow" style={{ minWidth: "10rem" }}>
                <label className="field__label" htmlFor="filter-from">
                  Du
                </label>
                <input
                  className="input"
                  id="filter-from"
                  type="date"
                  name="from"
                  defaultValue={fromDay}
                />
              </div>
              <div className="field grow" style={{ minWidth: "10rem" }}>
                <label className="field__label" htmlFor="filter-to">
                  Au
                </label>
                <input className="input" id="filter-to" type="date" name="to" defaultValue={toDay} />
              </div>
              <div className="field grow" style={{ minWidth: "11rem" }}>
                <label className="field__label" htmlFor="filter-staff">
                  Chaise
                </label>
                <select
                  className="select"
                  id="filter-staff"
                  name="staff"
                  defaultValue={query.staff ?? ""}
                >
                  <option value="">Toute l’équipe</option>
                  {team.data.map((person) => (
                    <option key={person.staff_id} value={person.staff_id}>
                      {person.display_name}
                      {person.active ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field grow" style={{ minWidth: "11rem" }}>
                <label className="field__label" htmlFor="filter-status">
                  État
                </label>
                <select
                  className="select"
                  id="filter-status"
                  name="status"
                  defaultValue={query.status ?? ""}
                >
                  <option value="">En attente et confirmés</option>
                  {STATUSES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row row-2 row--wrap">
                <ActionButton label="Afficher" type="submit" variant="secondary" icon="filter" />
                {filtered ? (
                  <Button label="Tout voir" variant="ghost" href="/dashboard" />
                ) : null}
              </div>
            </div>
          </form>
        </section>

        <section className="stack stack-4" aria-labelledby="appointments-title">
          <SectionHead
            label="Rendez-vous"
            aside={
              appointments.data.length > 0
                ? `${appointments.data.length}${appointments.next_cursor ? "+" : ""} sur cette période`
                : undefined
            }
          />
          <h2 className="t-caption t-dim" id="appointments-title" style={{ marginTop: "-8px" }}>
            {query.status
              ? `État : ${STATUSES.find(([v]) => v === query.status)?.[1] ?? query.status}.`
              : "En attente et confirmés. Choisissez un état pour voir le reste."}
          </h2>

          {appointments.data.length === 0 ? (
            <EmptyState
              sketch="chair"
              compact
              title="Aucun rendez-vous sur cette période"
              body={
                filtered
                  ? "Élargissez la période, changez de chaise ou d’état."
                  : "Votre agenda est libre. Votre page publique reste ouverte : le lien continue de travailler."
              }
              action={
                filtered ? <Button label="Tout voir" variant="secondary" href="/dashboard" /> : null
              }
            />
          ) : (
            <div className="stack stack-8">
              {groupByDay(appointments.data, zone).map((group) => (
                <section key={group.key} className="stack stack-3">
                  <div
                    className="row row--between row-3"
                    style={{
                      borderBottom: "1px solid var(--border-decorative)",
                      paddingBottom: "var(--space-2)",
                    }}
                  >
                    <h3 className="t-small" style={{ textTransform: "capitalize" }}>
                      {group.label}
                    </h3>
                    <span className="t-caption t-dim tnum">{group.items.length}</span>
                  </div>
                  <div className="stack stack-3">
                    {group.items.map((appointment) => (
                      <Appointment
                        key={appointment.appointment_id}
                        appointment={appointment}
                        zone={zone}
                        team={bookable}
                        back={back}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {appointments.next_cursor ? (
                <div className="row row-3" style={{ justifyContent: "center" }}>
                  <Button
                    label="Voir la suite"
                    variant="secondary"
                    iconEnd="arrow-right"
                    href={`/dashboard?${nextPage(query, fromDay, appointments.next_cursor)}`}
                  />
                </div>
              ) : null}
            </div>
          )}
        </section>

        <WalkIn
          services={services}
          team={bookable}
          me={me}
          back={back}
          hasStaff={bookable.length > 0}
        />
      </div>
    </>
  );
}

/* --- One appointment ------------------------------------------------------ */

/**
 * One row of the diary, and everything that can still happen to it.
 *
 * <p>The chair is on the row. So is the customer's telephone number, as a
 * `tel:` link - this is the provider's own address book, and the number is the
 * whole point of having taken it.
 *
 * <p>Only the transitions the state machine accepts are offered. A terminal
 * appointment shows a sentence instead: a button the server would refuse
 * teaches a provider that the dashboard is not to be trusted.
 */
function Appointment({
  appointment,
  zone,
  team,
  back,
}: {
  appointment: AppointmentView;
  zone: string;
  team: StaffView[];
  back: string;
}) {
  const status = appointment.status;
  const open = OPEN.has(status);
  const id = appointment.appointment_id;

  return (
    <article
      className={`appt status status--${status.toLowerCase()}${
        status === "CANCELLED" ? " appt--cancelled" : ""
      }`}
    >
      <span className="appt__time">
        <span className="appt__hour">{time(appointment.starts_at, zone)}</span>
        <span className="appt__dur">→ {time(appointment.ends_at, zone)}</span>
      </span>

      <div className="grow stack stack-3">
        <div className="row row--between row-3 row--wrap row--top">
          <div className="row row-3">
            <Avatar name={appointment.customer.full_name} size="sm" tone="client" />
            <span className="stack stack-1">
              <span className="appt__client">{appointment.customer.full_name}</span>
              <a className="t-small t-muted" href={`tel:${appointment.customer.phone}`}>
                {appointment.customer.phone}
              </a>
            </span>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="row row-2 row--wrap">
          <span className="appt__service">
            {appointment.service_name} · {money(appointment.price)}
          </span>
          <Badge label={appointment.staff_name} tone="neutral" icon="user" />
        </div>

        {appointment.customer_note ? (
          <Notice tone="neutral" icon="message" title="Note du client">
            {appointment.customer_note}
          </Notice>
        ) : null}

        {open ? (
          <div
            className="stack stack-3"
            style={{
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--border-decorative)",
            }}
          >
            <div className="row row-2 row--wrap">
              {status === "PENDING" ? (
                <Verb action={confirm} id={id} back={back} label="Confirmer" icon="check" primary />
              ) : (
                <>
                  <Verb action={complete} id={id} back={back} label="Terminé" icon="check-double" />
                  <Verb action={markNoShow} id={id} back={back} label="Absent" icon="user-x" />
                </>
              )}
            </div>

            {/* Time AND chair, in one submission, because the API takes both -
                a salon reassigns work all day and the mockup could only move
                the hour. */}
            <form className="row row-2 row--wrap" action={reschedule}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="back" value={back} />
              <input
                className="input"
                type="datetime-local"
                name="starts_at"
                required
                defaultValue={localInput(appointment.starts_at, zone)}
                aria-label={`Nouvelle heure pour ${appointment.customer.full_name}`}
                style={{ width: "auto", minWidth: "13rem" }}
              />
              <select
                className="select"
                name="staff_id"
                defaultValue={appointment.staff_id}
                aria-label={`Chaise pour ${appointment.customer.full_name}`}
                style={{ width: "auto", minWidth: "10rem" }}
              >
                {chairs(team, appointment).map((person) => (
                  <option key={person.staff_id} value={person.staff_id}>
                    {person.display_name}
                  </option>
                ))}
              </select>
              <ActionButton
                label="Déplacer"
                type="submit"
                variant="secondary"
                size="sm"
                icon="calendar"
              />
            </form>

            <form className="row row-2 row--wrap" action={cancel}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="back" value={back} />
              <input
                className="input"
                type="text"
                name="reason"
                maxLength={200}
                placeholder="Motif (pour vous seul, facultatif)"
                aria-label={`Motif d’annulation pour ${appointment.customer.full_name}`}
                style={{ width: "auto", minWidth: "16rem", flex: "1 1 16rem" }}
              />
              <ActionButton
                label="Annuler"
                type="submit"
                variant="quiet-danger"
                size="sm"
                icon="x"
              />
            </form>
          </div>
        ) : (
          <p className="t-caption t-dim">
            Ce rendez-vous est clos&nbsp;: il n’accepte plus d’action.
          </p>
        )}
      </div>
    </article>
  );
}

/** One verb, one form, one POST. Nothing to fill in. */
function Verb({
  action,
  id,
  back,
  label,
  icon,
  primary,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  back: string;
  label: string;
  icon: string;
  primary?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <ActionButton
        label={label}
        type="submit"
        variant={primary ? "primary" : "secondary"}
        size="sm"
        icon={icon}
      />
    </form>
  );
}

/* --- The counter ---------------------------------------------------------- */

/**
 * Somebody is standing at the counter, and it has to go in the book.
 *
 * <p>Not the public booking path, and the difference is the point: the
 * published hours and the notice period do not apply here. The provider is
 * writing in their own diary, and a diary that refuses to record what is
 * already happening is a diary the salon keeps on paper instead.
 */
function WalkIn({
  services,
  team,
  me,
  back,
  hasStaff,
}: {
  services: ServiceOfferingPage;
  team: StaffView[];
  me: CurrentMember;
  back: string;
  hasStaff: boolean;
}) {
  const ready = hasStaff && services.data.length > 0;

  return (
    <section className="stack stack-4" aria-labelledby="walkin-title">
      <SectionHead label="Inscrire quelqu’un au comptoir" />

      {ready ? null : (
        <EmptyState
          sketch="notebook"
          compact
          title="Il manque de quoi écrire"
          body={
            services.data.length === 0
              ? "Ajoutez au moins une prestation active : c’est elle qui porte la durée et le prix."
              : "Ajoutez au moins une personne active : un rendez-vous occupe une chaise, jamais un salon."
          }
          action={
            <Button
              label={services.data.length === 0 ? "Mes prestations" : "Mon équipe"}
              variant="secondary"
              href={services.data.length === 0 ? "/dashboard/services" : "/dashboard/team"}
            />
          }
        />
      )}

      {ready ? (
        <form className="card card--pad-lg stack stack-5" action={bookWalkIn}>
          <input type="hidden" name="back" value={back} />

          <Notice tone="info" title="Ici, c’est votre carnet" icon="info">
            Vos horaires publiés et votre délai de prévenance ne s’appliquent
            pas&nbsp;: la seule chose qui reste refusée, c’est deux personnes sur
            la même chaise à la même heure.
          </Notice>

          <h2 className="t-label" id="walkin-title">
            Le rendez-vous
          </h2>
          <div className="row row-3 row--wrap" style={{ alignItems: "flex-end" }}>
            <div className="field grow" style={{ minWidth: "14rem" }}>
              <label className="field__label" htmlFor="walkin-service">
                Prestation<span className="field__req" aria-hidden="true">*</span>
              </label>
              <select className="select" id="walkin-service" name="service_offering_id" required>
                {services.data.map((one) => (
                  <option key={one.service_offering_id} value={one.service_offering_id}>
                    {one.name} — {one.duration_minutes} min — {money(one.price)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field grow" style={{ minWidth: "11rem" }}>
              <label className="field__label" htmlFor="walkin-staff">
                Chaise<span className="field__req" aria-hidden="true">*</span>
              </label>
              <select
                className="select"
                id="walkin-staff"
                name="staff_id"
                required
                defaultValue={team.some((p) => p.staff_id === me.staff_id) ? me.staff_id : undefined}
              >
                {team.map((person) => (
                  <option key={person.staff_id} value={person.staff_id}>
                    {person.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field grow" style={{ minWidth: "13rem" }}>
              <label className="field__label" htmlFor="walkin-when">
                Heure<span className="field__req" aria-hidden="true">*</span>
              </label>
              <input
                className="input"
                id="walkin-when"
                type="datetime-local"
                name="starts_at"
                required
                aria-describedby="walkin-when-hint"
              />
              <p className="field__hint" id="walkin-when-hint">
                À votre montre.
              </p>
            </div>
          </div>

          <h2 className="t-label">La personne</h2>
          <div className="row row-3 row--wrap" style={{ alignItems: "flex-end" }}>
            <div className="field grow" style={{ minWidth: "13rem" }}>
              <label className="field__label" htmlFor="walkin-name">
                Nom<span className="field__req" aria-hidden="true">*</span>
              </label>
              <input
                className="input"
                id="walkin-name"
                type="text"
                name="full_name"
                required
                maxLength={120}
                autoComplete="off"
              />
            </div>
            <div className="field grow" style={{ minWidth: "13rem" }}>
              <label className="field__label" htmlFor="walkin-phone">
                Téléphone<span className="field__req" aria-hidden="true">*</span>
              </label>
              <input
                className="input"
                id="walkin-phone"
                type="tel"
                name="phone"
                required
                maxLength={24}
                inputMode="tel"
                autoComplete="off"
                placeholder="+224 6XX XX XX XX"
                aria-describedby="walkin-phone-hint"
              />
              <p className="field__hint" id="walkin-phone-hint">
                C’est par là que partent la confirmation et le rappel.
              </p>
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="walkin-note">
              Note <span className="t-caption t-dim" style={{ fontWeight: 500 }}>facultatif</span>
            </label>
            <textarea
              className="textarea"
              id="walkin-note"
              name="customer_note"
              maxLength={500}
              rows={2}
            />
          </div>

          <div className="row row-3 row--wrap">
            <ActionButton
              label="Inscrire"
              type="submit"
              variant="primary"
              icon="calendar-plus"
            />
            <span className="t-caption t-dim">
              Enregistré confirmé&nbsp;: vous l’avez accepté en l’écrivant.
            </span>
          </div>
        </form>
      ) : null}
    </section>
  );
}

/* --- Reading the clock and the calendar ----------------------------------- */

/**
 * Today, on the salon's wall clock.
 *
 * <p>`en-CA` because it formats as `YYYY-MM-DD`, which is what a date input and
 * the API's own parameters want. The zone is the provider's, never this
 * process's: a salon in Conakry read from a node in Paris would otherwise open
 * on tomorrow for the last hour of every evening.
 */
function today(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now());
}

/** The single reading of the machine's clock on this page. */
function now(): Date {
  return new Date();
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

/** The day an instant falls on, in the provider's zone. */
function dayKey(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(instant));
}

/** A diary is read by day, so it is drawn by day. The API already sorts. */
function groupByDay(
  rows: AppointmentView[],
  zone: string,
): { key: string; label: string; items: AppointmentView[] }[] {
  const groups: { key: string; label: string; items: AppointmentView[] }[] = [];
  for (const row of rows) {
    const key = dayKey(row.starts_at, zone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(row);
    else groups.push({ key, label: day(row.starts_at, zone), items: [row] });
  }
  return groups;
}

/**
 * A count that says when it is a floor rather than a total.
 *
 * <p>The API pages; two hundred is the most it will return at once. A salon
 * with more than that in one day would otherwise be told it has two hundred.
 */
function count(page: AppointmentPage): string {
  return `${page.data.length}${page.next_cursor ? "+" : ""}`;
}

/** The current filters, as the query string an action must come back to. */
function carry(query: Query): string {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.staff) params.set("staff", query.staff);
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  return params.toString();
}

/** The next page is this query plus the cursor the last one handed back. */
function nextPage(query: Query, fromDay: string, cursor: string): string {
  const params = new URLSearchParams();
  params.set("from", fromDay);
  if (query.to) params.set("to", query.to);
  if (query.staff) params.set("staff", query.staff);
  if (query.status) params.set("status", query.status);
  params.set("cursor", cursor);
  return params.toString();
}

/**
 * The chairs an appointment may be moved to.
 *
 * <p>Its own is always among them even when that person has been deactivated:
 * the select is pre-set to where the appointment already is, and an option the
 * list does not carry would silently move it to somebody else on submit.
 */
function chairs(team: StaffView[], appointment: AppointmentView): StaffView[] {
  if (team.some((person) => person.staff_id === appointment.staff_id)) return team;
  return [
    {
      staff_id: appointment.staff_id,
      display_name: appointment.staff_name,
      role: "STAFF",
      bookable: false,
      active: false,
    },
    ...team,
  ];
}
