import Link from "next/link";
import { Icon } from "@/components/icon";
import { ActionButton, Badge, Button, EmptyState, Notice, type BadgeTone } from "@/components/ui";
import { api } from "@/lib/api";
import { day, dateTime, instantFromLocal, money, time } from "@/lib/format";
import type {
  AppointmentPage,
  AppointmentView,
  CurrentMember,
  ProviderProfile,
  ReadinessView,
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

/**
 * How each state is drawn: the stripe down the left of the row, and the badge.
 *
 * <p>Stated here rather than taken from the shared STATUS map because the diary
 * has a sixth look the enum does not carry - a drop-off already declared ready -
 * and because two of the shared map's icons are not in the sprite this design
 * ships, so they would draw nothing at all.
 */
type Look = { row: string; label: string; icon: string; tone: BadgeTone };

const LOOK: Record<string, Look> = {
  PENDING: { row: "pending", label: "À confirmer", icon: "hourglass", tone: "warning" },
  CONFIRMED: { row: "confirmed", label: "Confirmé", icon: "check-circle", tone: "brand" },
  READY: { row: "ready", label: "Prêt", icon: "inbox", tone: "accent" },
  COMPLETED: { row: "completed", label: "Terminé", icon: "check", tone: "success" },
  NO_SHOW: { row: "noshow", label: "Absent", icon: "ban", tone: "danger" },
  CANCELLED: { row: "cancelled", label: "Annulé", icon: "x-circle", tone: "neutral" },
};

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

  const [provider, me, team, services, readiness] = await Promise.all([
    api<ProviderProfile>("/v1/provider-profile"),
    api<CurrentMember>("/v1/me"),
    api<{ data: StaffView[] }>("/v1/staff"),
    api<ServiceOfferingPage>("/v1/service-offerings", { query: { active: true, limit: 200 } }),
    // Not derived from the three reads above, though two of them are already
    // here. The server answers this from the predicates the publish gate itself
    // uses; counting active services in this page would put the definition of
    // "ready" in a second place, and the two would part the first time a
    // condition changed.
    api<ReadinessView>("/v1/provider-profile/readiness"),
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
  const owner = me.role === "OWNER";

  // Carried through every action so a verb pressed on Saturday's page comes
  // back to Saturday.
  const back = carry(query);

  const dropOffs = appointments.data.filter((row) => row.ready_by && row.status !== "CANCELLED");
  const hours = dayBounds(todayPage.data);

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <a
            className="btn btn--ghost btn--icon btn--sm hide-lg"
            href="#sections"
            aria-label="Toutes les sections"
          >
            <Icon name="menu" />
          </a>
          <div>
            <h1 className="appbar__title">Agenda</h1>
            {/* The weekday is lower case in French and upper case in the
                design's own copy; the transform settles it without touching
                the value. */}
            <div className="appbar__sub" style={{ textTransform: "capitalize" }}>
              {day(instantFromLocal(`${todayDay}T12:00`, zone), zone)}
            </div>
          </div>
          <div className="appbar__actions">
            <a className="btn btn--secondary btn--sm" href="#walkin">
              <Icon name="user-plus" size={16} className="btn__icon--idle" />
              <span className="btn__label--idle">Client sans rendez-vous</span>
            </a>
          </div>
        </div>
      </div>

      <main className="app__main has-tabbar" id="contenu">
        <div className="app__inner">
          {query.error ? (
            <div style={{ marginBottom: "var(--s-6)" }}>
              <Notice tone="danger" title="La demande n’a pas abouti">
                {REFUSALS[query.error] ?? "Le serveur a refusé cette action."}
              </Notice>
            </div>
          ) : null}

          {/* Under the refusal, above everything else: a message about the verb
              somebody just pressed outranks a list that will still be here
              tomorrow. Owner only - two of these three rooms and the publishing
              itself are refused to an employee, and a list of jobs somebody
              cannot do is a dead end. */}
          {owner ? <Readiness readiness={readiness} /> : null}

          <form
            className="toolbar"
            method="get"
            action="/dashboard"
            aria-label="Filtrer l’agenda"
            style={{ marginBottom: "var(--s-6)" }}
          >
            <span
              className="row row--wrap"
              style={{ gap: "var(--s-3)", alignItems: "flex-end" }}
            >
              <div className="field" style={{ minWidth: "9.5rem" }}>
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
              <div className="field" style={{ minWidth: "9.5rem" }}>
                <label className="field__label" htmlFor="filter-to">
                  Au
                </label>
                <input className="input" id="filter-to" type="date" name="to" defaultValue={toDay} />
              </div>
              <div className="field" style={{ minWidth: "11rem" }}>
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
              <div className="field" style={{ minWidth: "11rem" }}>
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
            </span>
            <span className="toolbar__spacer" />
            <ActionButton label="Afficher" type="submit" variant="secondary" size="sm" icon="filter" />
            {filtered ? (
              <Button label="Tout voir" variant="ghost" size="sm" href="/dashboard" />
            ) : null}
          </form>

          <div className="cols cols--main-aside">
            <div>
              {/* All of them, not only the ones in view: a request waiting on an
                  answer is not a thing to discover by scrolling to next
                  Thursday. Nothing at all when there is none - an empty queue
                  drawn every morning teaches a provider to stop reading it. */}
              {pendingPage.data.length > 0 ? (
                <section style={{ marginBottom: "var(--s-8)" }} aria-labelledby="pending-title">
                  <div className="row row--between" style={{ marginBottom: "var(--s-4)" }}>
                    <h2 className="t-h4 row" style={{ gap: "var(--s-2)" }} id="pending-title">
                      <Icon name="hourglass" size={18} />
                      <span>À confirmer</span>
                      <span className="count count--alert">{count(pendingPage)}</span>
                    </h2>
                    <span className="t-xs hide-sm">
                      Demandes reçues, en attente de votre réponse
                    </span>
                  </div>
                  {pendingPage.data.map((appointment) => (
                    <Appointment
                      key={`pending-${appointment.appointment_id}`}
                      appointment={appointment}
                      zone={zone}
                      team={bookable}
                      back={back}
                      scope="pending"
                    />
                  ))}
                </section>
              ) : null}

              <section aria-labelledby="appointments-title">
                <div className="row row--between" style={{ marginBottom: "var(--s-4)" }}>
                  <h2 className="t-h4" id="appointments-title">
                    {query.status
                      ? (STATUSES.find(([value]) => value === query.status)?.[1] ?? query.status)
                      : "En attente et confirmés"}
                  </h2>
                  <span className="t-xs hide-sm">
                    {appointments.data.length > 0
                      ? `${count(appointments)} sur cette période`
                      : "Choisissez un état pour voir le reste"}
                  </span>
                </div>

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
                      filtered ? (
                        <Button label="Tout voir" variant="secondary" href="/dashboard" />
                      ) : null
                    }
                  />
                ) : (
                  <>
                    {groupByDay(appointments.data, zone).map((group) => (
                      <section key={group.key} style={{ marginBottom: "var(--s-8)" }}>
                        <div className="slots__label">
                          <Icon name="calendar" size={16} />
                          <span>{group.label}</span>
                          <span className="count count--quiet">{group.items.length}</span>
                        </div>
                        {group.items.map((appointment) => (
                          <Appointment
                            key={appointment.appointment_id}
                            appointment={appointment}
                            zone={zone}
                            team={bookable}
                            back={back}
                            scope="day"
                          />
                        ))}
                      </section>
                    ))}

                    {appointments.next_cursor ? (
                      <div className="pager">
                        <Button
                          label="Voir la suite"
                          variant="secondary"
                          iconEnd="arrow-right"
                          href={`/dashboard?${nextPage(query, fromDay, appointments.next_cursor)}`}
                        />
                      </div>
                    ) : null}
                  </>
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

            <aside className="sticky-aside" style={{ display: "grid", gap: "var(--s-5)" }}>
              <div className="panel">
                <div className="panel__head">
                  <div className="panel__title">En un coup d’œil</div>
                </div>
                <div className="card__body" style={{ display: "grid", gap: "var(--s-4)" }}>
                  <div className="row row--between">
                    <span className="t-sm">Rendez-vous aujourd’hui</span>
                    <span className="t-h4 t-num">{count(todayPage)}</span>
                  </div>
                  <div className="row row--between">
                    <span className="t-sm">En attente de confirmation</span>
                    <span
                      className="t-h4 t-num"
                      style={
                        pendingPage.data.length > 0 ? { color: "var(--warning)" } : undefined
                      }
                    >
                      {count(pendingPage)}
                    </span>
                  </div>
                  <div className="row row--between">
                    <span className="t-sm">Première arrivée</span>
                    <span className="t-h4 t-num">{hours ? time(hours.first, zone) : "—"}</span>
                  </div>
                  <div className="row row--between">
                    <span className="t-sm">Dernier départ</span>
                    <span className="t-h4 t-num">{hours ? time(hours.last, zone) : "—"}</span>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Dépôts à rendre</div>
                    <div className="panel__sub">Sur la période affichée.</div>
                  </div>
                </div>
                {dropOffs.length === 0 ? (
                  <div className="card__body">
                    <EmptyState
                      sketch="tools"
                      compact
                      title="Aucun dépôt en cours"
                      body="Les prestations en mode dépôt apparaîtront ici, avec l’heure promise."
                    />
                  </div>
                ) : (
                  <div className="list" style={{ borderTop: 0 }}>
                    {dropOffs.map((row) => (
                      <div className="list__item" key={`drop-${row.appointment_id}`}>
                        <span
                          className="choice__icon"
                          style={{
                            width: 34,
                            height: 34,
                            background: "var(--accent-soft)",
                            color: "var(--accent-strong)",
                          }}
                        >
                          <Icon name="mode-dropoff" size={18} />
                        </span>
                        <div className="grow">
                          <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                            <span className="t-sm t-strong">{row.customer.full_name}</span>
                            {row.ready_at ? (
                              <Badge label="Prêt" tone="accent" icon="inbox" />
                            ) : null}
                          </div>
                          <div className="t-xs" style={{ marginTop: "2px" }}>
                            {row.service_name} · promis le{" "}
                            {/* Non-null: the filter above kept only rows that have one. */}
                            <strong className="t-strong">
                              {promised(row.ready_by as string, zone)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel__head">
                  <div className="panel__title">Raccourcis</div>
                </div>
                <div className="list" style={{ borderTop: 0 }}>
                  {owner ? (
                    <Shortcut
                      href="/dashboard/services"
                      icon="plus"
                      label="Ajouter une prestation"
                    />
                  ) : null}
                  <Shortcut
                    href="/dashboard/hours"
                    icon="calendar-x"
                    label="Déclarer une fermeture"
                  />
                  {owner ? (
                    <Shortcut href="/dashboard/profile" icon="qr" label="Imprimer mon QR code" />
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

/* --- The way to being live ------------------------------------------------ */

/**
 * The three conditions publishing has always had, said before the refusal
 * instead of as one.
 *
 * <p>They existed the whole time; a provider only ever met them by filling in a
 * form, pressing publish and being told what they should have done first.
 * Registration then landed them on that same form with no idea any of it
 * existed.
 *
 * <p>Nothing at all once the page is live. A salon already trading does not
 * need a tutorial, and one that never leaves reads as a fault in the product.
 */
function Readiness({ readiness }: { readiness: ReadinessView }) {
  if (readiness.published) return null;

  // Everything is in place, so the three ticks have nothing left to teach: what
  // is missing now is one switch on another screen, and saying so in one line
  // beats a list of three things already done.
  if (readiness.can_publish) {
    return (
      <div style={{ marginBottom: "var(--s-6)" }}>
        <Notice
          tone="success"
          title="Vous pouvez publier votre page"
          icon="check-circle"
          actions={<Button label="Ma page" variant="secondary" size="sm" href="/dashboard/profile" />}
        >
          Tout ce qu’il fallait est là. Il reste à cocher «&nbsp;Ma page est
          visible par les clients&nbsp;» et à enregistrer&nbsp;: tant que ce
          n’est pas fait, personne ne vous trouve.
        </Notice>
      </div>
    );
  }

  const done = [readiness.has_service, readiness.has_hours, readiness.has_bookable_staff].filter(
    Boolean,
  ).length;

  return (
    <div className="panel" style={{ marginBottom: "var(--s-6)" }}>
      <div className="panel__head">
        <div>
          <div className="panel__title">Votre page n’est pas encore publiée</div>
          <div className="panel__sub">
            Trois conditions, vérifiées par le serveur. Elles ne sont pas négociables.
          </div>
        </div>
        <span className="count count--quiet">{done} sur 3</span>
      </div>
      <div className="card__body">
        <ul className="checklist">
          <Condition
            done={readiness.has_service}
            label="Une prestation active"
            hint="Ce qu’une cliente choisit. C’est elle qui porte la durée et le prix."
            href="/dashboard/services"
            cta="Mes prestations"
          />
          <Condition
            done={readiness.has_hours}
            label="Des horaires d’ouverture"
            hint="La semaine que vous travaillez. Sans elle, votre carnet n’a aucun créneau à offrir."
            href="/dashboard/hours"
            cta="Mes horaires"
          />
          {/* Its own line rather than folded into the hours, though nobody
              bookable also means no combined week. Told "vous n'avez pas
              d'horaires" when the real problem is that everyone was stood down, a
              provider goes and fills in a week that was already there. */}
          <Condition
            done={readiness.has_bookable_staff}
            label="Une personne réservable"
            hint="Un rendez-vous occupe une chaise, jamais un salon. Vous seul suffisez."
            href="/dashboard/team"
            cta="Mon équipe"
          />
        </ul>
      </div>
    </div>
  );
}

/**
 * One condition, whether it is met, and the room that meets it.
 *
 * <p>The link is there whether or not it is ticked. A provider who wants to see
 * the hours they declared should not have to un-declare them to get a way in.
 */
function Condition({
  done,
  label,
  hint,
  href,
  cta,
}: {
  done: boolean;
  label: string;
  hint: string;
  href: string;
  cta: string;
}) {
  return (
    <li className={`checklist__item checklist__item--${done ? "done" : "todo"}`}>
      {/* Hidden from a screen reader: a coloured ring is not a word, so the
          state is said in the label instead. */}
      <span className="checklist__mark" aria-hidden="true">
        {done ? <Icon name="check" size={16} /> : null}
      </span>
      <span className="checklist__text grow">
        {label}
        <span className="sr-only">{done ? " : fait" : " : à faire"}</span>
        <small>{hint}</small>
      </span>
      <Button label={cta} variant="secondary" size="sm" href={href} />
    </li>
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
 * appointment says so in a sentence instead: a button the server would refuse
 * teaches a provider that the dashboard is not to be trusted.
 *
 * <p>`scope` only makes the two dialogue identifiers unique. The same
 * appointment is drawn twice on this page - once in the queue of requests, once
 * in the day it falls on - and two dialogues sharing an id would open the wrong
 * one.
 */
function Appointment({
  appointment,
  zone,
  team,
  back,
  scope,
}: {
  appointment: AppointmentView;
  zone: string;
  team: StaffView[];
  back: string;
  scope: string;
}) {
  const status = appointment.status;
  const open = OPEN.has(status);
  const id = appointment.appointment_id;
  const look = lookOf(appointment);
  const where = fulfilment(appointment);
  const phone = appointment.customer.phone;
  const cancelId = `dlg-cancel-${scope}-${id}`;
  const moveId = `dlg-move-${scope}-${id}`;

  return (
    <article className={`appt appt--${look.row}`}>
      <div>
        <div className="appt__time">{time(appointment.starts_at, zone)}</div>
        <div className="appt__dur">→ {time(appointment.ends_at, zone)}</div>
      </div>

      <div className="grow">
        <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <span className="appt__who">{appointment.customer.full_name}</span>
          <Badge label={look.label} tone={look.tone} icon={look.icon} />
        </div>
        <div className="appt__what">
          {appointment.service_name} · {money(appointment.price)} · {appointment.staff_name}
        </div>

        <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
          <span className={`mode mode--${where.row}`}>
            <Icon name={where.icon} />
            {where.label}
          </span>
          <a className="fact" href={`tel:${phone}`}>
            <Icon name="phone" />
            {phone}
          </a>
          {appointment.ready_by ? (
            <span className="fact">
              <Icon name="hourglass" />
              Promis le {promised(appointment.ready_by, zone)}
            </span>
          ) : null}
          {appointment.service_address ? (
            <span className="fact">
              <Icon name="pin" />
              {appointment.service_address.directions}
            </span>
          ) : null}
        </div>

        {appointment.customer_note ? (
          <div style={{ marginTop: "var(--s-3)" }}>
            <Notice tone="neutral" icon="message" title="Note du client">
              {appointment.customer_note}
            </Notice>
          </div>
        ) : null}

        {open ? null : (
          <p className="t-xs" style={{ marginTop: "var(--s-2)" }}>
            Ce rendez-vous est clos&nbsp;: il n’accepte plus d’action.
          </p>
        )}

        {open ? (
          <>
            <CancelDialog id={id} dialogId={cancelId} back={back} name={appointment.customer.full_name} />
            <MoveDialog
              appointment={appointment}
              dialogId={moveId}
              back={back}
              team={team}
              zone={zone}
            />
          </>
        ) : null}
      </div>

      <div className="appt__side">
        {status === "PENDING" ? (
          <Verb action={confirm} id={id} back={back} label="Confirmer" icon="check" primary />
        ) : null}
        {status === "CONFIRMED" ? (
          <Verb action={complete} id={id} back={back} label="Terminer" icon="check" />
        ) : null}

        <details className="menu">
          <summary className="btn btn--ghost btn--icon btn--sm" aria-label="Autres actions">
            <Icon name="more-v" size={18} />
          </summary>
          <div className="menu__panel">
            {/* wa.me wants the number without its plus sign; the contract sends
                E.164, which is the same digits. */}
            <a className="menu__item" href={`https://wa.me/${phone.replace(/\D/g, "")}`}>
              <Icon name="whatsapp" size={18} />
              Écrire au client
            </a>
            <a className="menu__item" href={`tel:${phone}`}>
              <Icon name="phone" size={18} />
              Appeler
            </a>

            {open ? (
              <>
                {/* One entry for two of the mockup's screens. The API moves the
                    hour and the chair in a single operation because the
                    exclusion constraint keys on the staff member: a change of
                    chair is arbitrated as a booking on the new one and releases
                    the old in the same statement. */}
                <button className="menu__item" type="button" data-dialog-open={moveId}>
                  <Icon name="calendar" size={18} />
                  Déplacer ou changer de chaise
                </button>
                <span className="menu__sep" />
                {status === "CONFIRMED" ? (
                  <MenuVerb action={markNoShow} id={id} back={back} label="Marquer absent" icon="ban" />
                ) : null}
                <button
                  className="menu__item menu__item--danger"
                  type="button"
                  data-dialog-open={cancelId}
                >
                  <Icon name="x-circle" size={18} />
                  Annuler le rendez-vous
                </button>
              </>
            ) : null}
          </div>
        </details>
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

/** The same POST, drawn as a row of the overflow menu. */
function MenuVerb({
  action,
  id,
  back,
  label,
  icon,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  back: string;
  label: string;
  icon: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <button className="menu__item" type="submit" style={{ width: "100%" }}>
        <Icon name={icon} size={18} />
        {label}
      </button>
    </form>
  );
}

/**
 * Cancelling, behind a dialogue, with the reason the provider wants recorded.
 *
 * <p>The reason is private to them: the contract says it appears in no message
 * the customer receives, which is why the box can be blunt - and why this does
 * not repeat the mockup's promise that a WhatsApp goes out with it.
 */
function CancelDialog({
  id,
  dialogId,
  back,
  name,
}: {
  id: string;
  dialogId: string;
  back: string;
  name: string;
}) {
  return (
    <dialog className="dialog" id={dialogId}>
      <div className="dialog__inner">
        <div className="dialog__head">
          <h2 className="dialog__title">Annuler ce rendez-vous&nbsp;?</h2>
        </div>
        <form action={cancel}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={back} />
          <div className="dialog__body">
            <p>
              Le créneau de {name} redevient immédiatement disponible. Cette action ne peut pas être
              annulée.
            </p>
            <div style={{ marginTop: "var(--s-5)" }}>
              <div className="field">
                <label className="field__label" htmlFor={`${dialogId}-reason`}>
                  Motif
                  <span className="field__optional">facultatif</span>
                </label>
                <textarea
                  className="textarea"
                  id={`${dialogId}-reason`}
                  name="reason"
                  maxLength={200}
                  style={{ minHeight: 80 }}
                  placeholder="Empêchement, je rappelle pour reprogrammer."
                />
                <p className="field__hint">
                  Pour vous seul&nbsp;: il ne part dans aucun message au client.
                </p>
              </div>
            </div>
          </div>
          <div className="dialog__foot">
            <button className="btn btn--secondary" type="button" data-dialog-close>
              <span className="btn__label--idle">Garder le rendez-vous</span>
            </button>
            <button className="btn btn--danger" type="submit">
              <span className="btn__label--idle">Annuler le rendez-vous</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

/**
 * The new hour AND the new chair, in one submission, because the API takes both.
 *
 * <p>`staff_id` is always sent, pre-set to where the appointment already is, so
 * a pure move in time is a move that names the same chair.
 */
function MoveDialog({
  appointment,
  dialogId,
  back,
  team,
  zone,
}: {
  appointment: AppointmentView;
  dialogId: string;
  back: string;
  team: StaffView[];
  zone: string;
}) {
  return (
    <dialog className="dialog" id={dialogId}>
      <div className="dialog__inner">
        <div className="dialog__head">
          <h2 className="dialog__title">Déplacer ce rendez-vous</h2>
        </div>
        <form action={reschedule}>
          <input type="hidden" name="id" value={appointment.appointment_id} />
          <input type="hidden" name="back" value={back} />
          <div className="dialog__body">
            <div className="dl" style={{ marginBottom: "var(--s-6)" }}>
              <div className="dl__row">
                <span className="dl__key">Actuellement</span>
                <span className="dl__val">{dateTime(appointment.starts_at, zone)}</span>
              </div>
              <div className="dl__row">
                <span className="dl__key">Avec</span>
                <span className="dl__val">{appointment.staff_name}</span>
              </div>
              <div className="dl__row">
                <span className="dl__key">Prix figé</span>
                <span className="dl__val t-price">{money(appointment.price)}</span>
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor={`${dialogId}-when`}>
                Nouvelle heure
                <span className="field__req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                className="input"
                id={`${dialogId}-when`}
                type="datetime-local"
                name="starts_at"
                required
                defaultValue={localInput(appointment.starts_at, zone)}
              />
              <p className="field__hint">
                À votre montre. La durée et le prix ne changent pas.
              </p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor={`${dialogId}-staff`}>
                Avec
              </label>
              <select
                className="select"
                id={`${dialogId}-staff`}
                name="staff_id"
                defaultValue={appointment.staff_id}
              >
                {chairs(team, appointment).map((person) => (
                  <option key={person.staff_id} value={person.staff_id}>
                    {person.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="dialog__foot">
            <button className="btn btn--secondary" type="button" data-dialog-close>
              <span className="btn__label--idle">Garder l’horaire</span>
            </button>
            <button className="btn btn--primary" type="submit">
              <Icon name="calendar" size={18} className="btn__icon--idle" />
              <span className="btn__label--idle">Déplacer</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
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
    <section id="walkin" style={{ marginTop: "var(--s-8)" }} aria-labelledby="walkin-title">
      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title" id="walkin-title">
              Client sans rendez-vous
            </div>
            <div className="panel__sub">
              Il apparaîtra dans l’agenda et bloquera le créneau.
            </div>
          </div>
        </div>

        {ready ? (
          <form action={bookWalkIn}>
            <input type="hidden" name="back" value={back} />
            <div className="card__body">
              <Notice tone="info" title="Ici, c’est votre carnet" icon="info">
                Vos horaires publiés et votre délai de prévenance ne s’appliquent
                pas&nbsp;: la seule chose qui reste refusée, c’est deux personnes
                sur la même chaise à la même heure.
              </Notice>

              <div className="t-overline" style={{ margin: "var(--s-6) 0 var(--s-3)" }}>
                Le rendez-vous
              </div>

              <div className="field">
                <label className="field__label" htmlFor="walkin-service">
                  Prestation
                  <span className="field__req" aria-hidden="true">
                    *
                  </span>
                </label>
                <select className="select" id="walkin-service" name="service_offering_id" required>
                  {services.data.map((one) => (
                    <option key={one.service_offering_id} value={one.service_offering_id}>
                      {one.name} — {one.duration_minutes} min — {money(one.price)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cols cols--2" style={{ gap: "var(--s-5)", marginTop: "var(--s-5)" }}>
                <div className="field">
                  <label className="field__label" htmlFor="walkin-when">
                    Heure de début
                    <span className="field__req" aria-hidden="true">
                      *
                    </span>
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
                <div className="field">
                  <label className="field__label" htmlFor="walkin-staff">
                    Avec
                    <span className="field__req" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <select
                    className="select"
                    id="walkin-staff"
                    name="staff_id"
                    required
                    defaultValue={
                      team.some((person) => person.staff_id === me.staff_id)
                        ? me.staff_id
                        : undefined
                    }
                  >
                    {team.map((person) => (
                      <option key={person.staff_id} value={person.staff_id}>
                        {person.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="t-overline" style={{ margin: "var(--s-6) 0 var(--s-3)" }}>
                La personne
              </div>

              <div className="field">
                <label className="field__label" htmlFor="walkin-name">
                  Nom du client
                  <span className="field__req" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  className="input"
                  id="walkin-name"
                  type="text"
                  name="full_name"
                  required
                  maxLength={120}
                  autoComplete="off"
                  placeholder="Mariama Touré"
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="walkin-phone">
                  Téléphone
                  <span className="field__req" aria-hidden="true">
                    *
                  </span>
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

              <div className="field">
                <label className="field__label" htmlFor="walkin-note">
                  Note
                  <span className="field__optional">facultatif</span>
                </label>
                <textarea
                  className="textarea"
                  id="walkin-note"
                  name="customer_note"
                  maxLength={500}
                  style={{ minHeight: 80 }}
                />
              </div>
            </div>

            <div className="card__foot">
              <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
                <span className="t-xs">
                  Enregistré confirmé&nbsp;: vous l’avez accepté en l’écrivant.
                </span>
                <span className="grow" />
                <ActionButton
                  label="Enregistrer le rendez-vous"
                  type="submit"
                  variant="primary"
                  icon="check"
                />
              </div>
            </div>
          </form>
        ) : (
          <div className="card__body">
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
          </div>
        )}
      </div>
    </section>
  );
}

/* --- Small pieces --------------------------------------------------------- */

function Shortcut({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link className="list__item list__item--link" href={href}>
      <Icon name={icon} size={18} />
      <span className="grow t-sm t-strong">{label}</span>
      <Icon name="chevron-right" size={18} />
    </Link>
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

/**
 * A promise, written the way one is said out loud: a day and an hour.
 *
 * <p>Here rather than in `format.ts` because it is this screen's phrasing, not
 * the product's - `dateTime` writes the full sentence a confirmation needs, and
 * it wraps onto three lines inside a 340 px panel.
 */
function promised(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(instant));
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
 * The first arrival and the last departure of the day.
 *
 * <p>Cancelled rows are left out on purpose: an appointment that was called off
 * at seven in the morning is not a reason to open at seven. Null when there is
 * nothing left, which is a closed day rather than a zero.
 */
function dayBounds(rows: AppointmentView[]): { first: string; last: string } | null {
  let first: string | null = null;
  let last: string | null = null;
  for (const row of rows) {
    if (row.status === "CANCELLED") continue;
    if (!first || Date.parse(row.starts_at) < Date.parse(first)) first = row.starts_at;
    if (!last || Date.parse(row.ends_at) > Date.parse(last)) last = row.ends_at;
  }
  return first && last ? { first, last } : null;
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

/**
 * How this row is drawn.
 *
 * <p>A confirmed drop-off whose work has been declared finished gets its own
 * look: the customer is not waiting for an hour any more, they are waiting to
 * be told to come. A status the map does not hold is a contract change nobody
 * applied, and it renders as itself rather than as a guess.
 */
function lookOf(appointment: AppointmentView): Look {
  const isReady = appointment.status === "CONFIRMED" && Boolean(appointment.ready_at);
  return (
    LOOK[isReady ? "READY" : appointment.status] ?? {
      row: "pending",
      label: appointment.status,
      icon: "hourglass",
      tone: "neutral",
    }
  );
}

/**
 * Where the work happens.
 *
 * <p>Read from the two fields that exist only for their own mode, because the
 * row carries no `fulfilment` of its own: an address is documented as absent on
 * everything that happens at the shop, and a promise as absent on everything
 * the customer did not leave behind.
 */
function fulfilment(appointment: AppointmentView): {
  row: string;
  icon: string;
  label: string;
} {
  if (appointment.service_address) {
    return { row: "at-customer", icon: "mode-atcustomer", label: "Chez le client" };
  }
  if (appointment.ready_by) {
    return { row: "drop-off", icon: "mode-dropoff", label: "Dépôt" };
  }
  return { row: "on-site", icon: "mode-onsite", label: "Sur place" };
}
