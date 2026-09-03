import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { Icon, Scene } from "@/components/icon";
import {
  ActionButton,
  Badge,
  Button,
  EmptyState,
  Notice,
  initials,
  type BadgeTone,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { day, instantFromLocal, money, time } from "@/lib/format";
import type {
  AppointmentPage,
  AppointmentView,
  ClosureList,
  ClosureView,
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
    "Ce rendez-vous a changé entre-temps : quelqu’un l’a confirmé, terminé ou annulé pendant que vous lisiez. Rechargez la page pour voir où il en est.",
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

/**
 * The three ways the design reads one diary, folded onto one route.
 *
 * <p>The design gives the week and the counter their own addresses. They are
 * not separate rooms - they are the same appointments read three ways, and the
 * design's own segmented control says so. The overview it draws at /dashboard
 * is the head of this page.
 */
const VIEWS: [string, string][] = [
  ["day", "Jour"],
  ["week", "Semaine"],
  ["dropoffs", "Dépôts"],
];

/** The two halves of a working day, as the design labels them. */
const HALVES: [string, string, string][] = [
  ["morning", "Matin", "sun"],
  ["afternoon", "Après-midi", "clock"],
];

/** How far back a promise may still be outstanding, and how far ahead to look. */
const PROMISE_WINDOW_DAYS = 90;

type Query = {
  view?: string;
  from?: string;
  to?: string;
  staff?: string;
  status?: string;
  cursor?: string;
  error?: string;
};

const EMPTY_PAGE: AppointmentPage = { data: [], next_cursor: null };

/* --- The counter's own verbs ---------------------------------------------- */

/**
 * What the design calls a drop-off queue, as three operations the API already
 * publishes: `readiness`, `completion` and `promise`.
 *
 * <p>They are written here rather than beside the other verbs in `actions.ts`
 * for one reason: the return address. `actions.ts` rebuilds the diary's URL
 * from a fixed list of filters that does not include which of the three views
 * is being read, so a hand-over confirmed from the counter would land back on
 * the day. These come back to the counter. They belong in `actions.ts` the
 * moment that list learns about the view.
 */
const DROP_OFF_CARRIED = ["staff", "status"] as const;

function counterUrl(back: string, error?: string): string {
  const carried = new URLSearchParams(back);
  const params = new URLSearchParams({ view: "dropoffs" });
  for (const key of DROP_OFF_CARRIED) {
    const value = carried.get(key);
    if (value) params.set(key, value);
  }
  if (error) params.set("error", error);
  return `/dashboard?${params.toString()}`;
}

async function atTheCounter(back: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(counterUrl(back, error.code ?? "UNKNOWN"));
    }
    throw error;
  }
  revalidatePath("/dashboard");
  redirect(counterUrl(back));
}

/** The work is done and the customer can be told to come back for it. */
async function markReady(formData: FormData): Promise<void> {
  "use server";
  const id = String(formData.get("id"));
  await atTheCounter(String(formData.get("back") ?? ""), () =>
    api(`/v1/appointments/${encodeURIComponent(id)}/readiness`, { method: "POST" }),
  );
}

/** They came, they took it away. The same completion the diary uses. */
async function handOver(formData: FormData): Promise<void> {
  "use server";
  const id = String(formData.get("id"));
  await atTheCounter(String(formData.get("back") ?? ""), () =>
    api(`/v1/appointments/${encodeURIComponent(id)}/completion`, { method: "POST" }),
  );
}

/**
 * "The machine broke, it will be Friday."
 *
 * <p>The zone is read from the API rather than taken from a hidden field: a
 * client deciding what its own wall clock means is how a promise lands an hour
 * out with nothing to show for it.
 */
async function movePromise(formData: FormData): Promise<void> {
  "use server";
  const id = String(formData.get("id"));
  const local = String(formData.get("ready_by"));
  await atTheCounter(String(formData.get("back") ?? ""), async () => {
    const provider = await api<ProviderProfile>("/v1/provider-profile");
    await api(`/v1/appointments/${encodeURIComponent(id)}/promise`, {
      method: "PUT",
      body: { ready_by: instantFromLocal(local, provider.timezone) },
    });
  });
}

/* --- The diary ------------------------------------------------------------ */

/**
 * The provider's day: what is waiting on an answer, then the diary itself.
 *
 * <p>The design draws these as two screens - an overview and an agenda - and
 * this application has always kept them as one, which is the ruling. So the
 * overview leads: the requests nobody has answered, then the day, then the
 * panels that read it at a glance.
 *
 * <p>Every row says whose chair it is: `staff_id` is the resource key of the
 * constraint that stops double booking, so a salon with five chairs would
 * otherwise get one undifferentiated stream. It is on the row and in the
 * filter.
 *
 * <p>The filters and the day being read are a GET, so a day is a URL - it can
 * be bookmarked, sent to a colleague, and the back button returns to it.
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
  const view = VIEWS.some(([value]) => value === query.view) ? (query.view as string) : "day";

  // Opening the dashboard means "from the start of today", not "from now": the
  // morning's appointments are exactly the ones still waiting to be marked
  // done, and a ray that starts at this minute hides every one of them.
  const anchor = query.from?.trim() || todayDay;
  const weekStart = mondayOf(anchor);
  const weekEnd = addDays(weekStart, 6);
  const fromDay = view === "week" ? weekStart : anchor;
  const toDay = view === "week" ? weekEnd : query.to?.trim() || anchor;

  // The chair whose closures are read. There is no salon-wide calendar to ask
  // for - `listClosures` takes one staff identifier - so it is the person being
  // filtered on, or the person reading.
  const chair = query.staff || me.staff_id;

  const [appointments, todayPage, pendingPage, promises, closures] = await Promise.all([
    view === "dropoffs"
      ? Promise.resolve(EMPTY_PAGE)
      : api<AppointmentPage>("/v1/appointments", {
          query: {
            from: instantFromLocal(`${fromDay}T00:00`, zone),
            to: instantFromLocal(`${toDay}T23:59`, zone),
            staff_id: query.staff || undefined,
            status: query.status || undefined,
            cursor: query.cursor || undefined,
            // A week is read whole or not at all: there is nowhere to hang a
            // "voir la suite" on a grid of seven columns.
            limit: view === "week" ? 200 : 50,
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
    // The counter is not a period. A shirt handed over in July and promised for
    // last Tuesday is exactly the row that must not fall off the bottom of a
    // date filter, so this one reads back as well as forward.
    api<AppointmentPage>("/v1/appointments", {
      query: {
        from: instantFromLocal(`${addDays(todayDay, -PROMISE_WINDOW_DAYS)}T00:00`, zone),
        to: instantFromLocal(`${addDays(todayDay, PROMISE_WINDOW_DAYS)}T23:59`, zone),
        staff_id: query.staff || undefined,
        limit: 200,
      },
    }),
    closuresOf(chair, minDay(fromDay, todayDay), maxDay(toDay, addDays(todayDay, 90))),
  ]);

  const bookable = team.data.filter((person) => person.active);
  const filtered = Boolean(query.staff || query.status);
  const owner = me.role === "OWNER";
  const suspended = provider.status === "SUSPENDED";

  // Carried through every action so a verb pressed on Saturday's page comes
  // back to Saturday.
  const back = carry(query);
  const dropOffs = promises.data.filter(
    (row) => row.ready_by && row.status !== "CANCELLED" && row.status !== "COMPLETED",
  );
  // Read once, and passed down: a promise is late or it is not, and two
  // readings of the clock inside one render can disagree.
  const clock = now().getTime();
  const late = dropOffs.filter((row) => overdue(row, clock)).length;
  const hours = dayBounds(todayPage.data);
  const chairName =
    team.data.find((person) => person.staff_id === chair)?.display_name ?? me.display_name;
  // The panel says "à venir", so it is. The week grid still needs the ones
  // behind it, which is why the read is wider than the panel.
  const upcoming = closures.filter((closure) => closure.date >= todayDay).slice(0, 6);

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
            <h1 className="appbar__title">
              {view === "dropoffs" ? "Dépôts en cours" : "Agenda"}
            </h1>
            {/* The weekday is lower case in French and upper case in the
                design's own copy; the transform settles it without touching
                the value. */}
            <div
              className="appbar__sub"
              style={view === "day" ? { textTransform: "capitalize" } : undefined}
            >
              {view === "dropoffs"
                ? `${provider.business_name} · ce qui est chez vous et ce qui est promis`
                : view === "week"
                  ? weekWords(weekStart, weekEnd)
                  : day(instantFromLocal(`${anchor}T12:00`, zone), zone)}
            </div>
          </div>
          <div className="appbar__actions">
            <button className="btn btn--secondary btn--sm" type="button" data-dialog-open="dlg-walkin">
              <Icon name="user-plus" size={16} className="btn__icon--idle" />
              <span className="btn__label--idle">Client sans rendez-vous</span>
            </button>
          </div>
        </div>
      </div>

      <main className="app__main has-tabbar" id="contenu">
        <div className={view === "week" ? "app__inner app__inner--wide" : "app__inner"}>
          {query.error ? (
            <div style={{ marginBottom: "var(--s-6)" }}>
              <Notice tone="danger" title="La demande n’a pas abouti">
                {REFUSALS[query.error] ?? "Le serveur a refusé cette action."}
              </Notice>
            </div>
          ) : null}

          {/* A suspension outranks everything else on the screen: the page is
              gone from the public path and the provider has one thing to do
              about it. */}
          {suspended ? (
            <div style={{ marginBottom: "var(--s-6)" }}>
              <Notice
                tone="danger"
                title="Votre établissement est suspendu"
                actions={
                  owner ? (
                    <Button
                      label="Comprendre et répondre"
                      variant="danger"
                      size="sm"
                      href="/dashboard/contestation"
                    />
                  ) : null
                }
              >
                Votre page n’est plus visible du public et n’accepte plus de nouvelles
                réservations. Les rendez-vous déjà pris restent valables et apparaissent
                ci-dessous.
              </Notice>
            </div>
          ) : null}

          {/* Under the refusal, above everything else: a message about the verb
              somebody just pressed outranks a list that will still be here
              tomorrow. Owner only - two of these three rooms and the publishing
              itself are refused to an employee, and a list of jobs somebody
              cannot do is a dead end. */}
          {owner && !suspended ? <Readiness readiness={readiness} provider={provider} services={services} team={team.data} /> : null}

          <div className="toolbar" style={{ marginBottom: "var(--s-6)" }}>
            {view === "dropoffs" ? null : (
              <span className="row" style={{ gap: "var(--s-1)" }}>
                <Link
                  className="btn btn--secondary btn--sm btn--icon"
                  href={link(query, { view, from: step(view, anchor, -1) })}
                  aria-label={view === "week" ? "Semaine précédente" : "Jour précédent"}
                >
                  <Icon name="chevron-left" size={16} className="btn__icon--idle" />
                </Link>
                <Link
                  className="btn btn--secondary btn--sm"
                  href={link(query, { view, from: undefined })}
                >
                  <span className="btn__label--idle">
                    {view === "week" ? "Cette semaine" : "Aujourd’hui"}
                  </span>
                </Link>
                <Link
                  className="btn btn--secondary btn--sm btn--icon"
                  href={link(query, { view, from: step(view, anchor, 1) })}
                  aria-label={view === "week" ? "Semaine suivante" : "Jour suivant"}
                >
                  <Icon name="chevron-right" size={16} className="btn__icon--idle" />
                </Link>
              </span>
            )}

            <span className="segmented">
              {VIEWS.map(([value, label]) => (
                <Link
                  key={value}
                  className={value === view ? "segmented__item is-active" : "segmented__item"}
                  href={link(query, { view: value, from: anchor })}
                  aria-current={value === view ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
            </span>

            <span className="toolbar__spacer" />

            {/* A GET form and not a script: a filtered diary is a URL, so it
                survives the back button and can be sent to a colleague. */}
            <form
              method="get"
              action="/dashboard"
              className="row row--wrap"
              style={{ gap: "var(--s-2)" }}
              aria-label="Filtrer l’agenda"
            >
              {/* Only what was actually asked for. A day pinned into the URL
                  by pressing "Afficher" would still say Monday on Tuesday. */}
              {view === "day" ? null : <input type="hidden" name="view" value={view} />}
              {query.from ? <input type="hidden" name="from" value={query.from} /> : null}
              <select
                className="select"
                style={{ width: "auto", minHeight: "36px", fontSize: "var(--fs-xs)" }}
                name="staff"
                aria-label="Filtrer par personne"
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
              <select
                className="select"
                style={{ width: "auto", minHeight: "36px", fontSize: "var(--fs-xs)" }}
                name="status"
                aria-label="Filtrer par état"
                defaultValue={query.status ?? ""}
              >
                <option value="">En attente et confirmés</option>
                {STATUSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <ActionButton
                label="Afficher"
                type="submit"
                variant="secondary"
                size="sm"
                icon="filter"
              />
            </form>
          </div>

          {view === "week" ? (
            <Week
              rows={appointments.data}
              from={weekStart}
              todayDay={todayDay}
              zone={zone}
              query={query}
              closures={closures}
            />
          ) : view === "dropoffs" ? (
            <Counter rows={dropOffs} late={late} zone={zone} back={back} clock={clock} />
          ) : (
            <div className="cols cols--main-aside">
              <div>
                {/* All of them, not only the ones in view: a request waiting on
                    an answer is not a thing to discover by scrolling to next
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
                      La journée
                    </h2>
                    <span className="t-xs hide-sm">
                      {query.status
                        ? (STATUSES.find(([value]) => value === query.status)?.[1] ?? query.status)
                        : "En attente et confirmés"}
                    </span>
                  </div>

                  {appointments.data.length === 0 ? (
                    <EmptyState
                      sketch="chair"
                      title="Aucun rendez-vous ce jour-là"
                      body={
                        filtered
                          ? "Changez de personne ou d’état, ou passez à un autre jour."
                          : "Votre agenda est libre. Votre page publique reste ouverte : le lien continue de travailler."
                      }
                    />
                  ) : (
                    <>
                      {byDay(appointments.data, zone).map((group, _, all) => (
                        <Fragment key={group.key}>
                          {all.length > 1 ? (
                            <div className="slots__label">
                              <Icon name="calendar" size={16} /> {group.label}
                            </div>
                          ) : null}
                          {HALVES.map(([id, label, icon]) => {
                            const items = group.items.filter(
                              (row) => halfOfDay(row.starts_at, zone) === id,
                            );
                            if (items.length === 0) return null;
                            return (
                              <section key={id} style={{ marginBottom: "var(--s-8)" }}>
                                <div className="slots__label">
                                  <Icon name={icon} size={16} /> {label}
                                </div>
                                {items.map((appointment) => (
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
                            );
                          })}
                        </Fragment>
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
              </div>

              <aside className="sticky-aside" style={{ display: "grid", gap: "var(--s-5)" }}>
                <div className="panel">
                  <div className="panel__head">
                    <div className="panel__title">En un coup d’œil</div>
                  </div>
                  <div className="card__body" style={{ display: "grid", gap: "var(--s-4)" }}>
                    <div className="row row--between">
                      <span className="t-sm">Rendez-vous aujourd’hui</span>
                      <span className="t-h4">{count(todayPage)}</span>
                    </div>
                    <div className="row row--between">
                      <span className="t-sm">En attente de confirmation</span>
                      <span
                        className="t-h4"
                        style={pendingPage.data.length > 0 ? { color: "var(--warning)" } : undefined}
                      >
                        {count(pendingPage)}
                      </span>
                    </div>
                    <div className="row row--between">
                      <span className="t-sm">Première arrivée</span>
                      <span className="t-h4">{hours ? time(hours.first, zone) : "·"}</span>
                    </div>
                    <div className="row row--between">
                      <span className="t-sm">Dernier départ</span>
                      <span className="t-h4">{hours ? time(hours.last, zone) : "·"}</span>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel__head">
                    <div className="panel__title">Dépôts à rendre</div>
                  </div>
                  {dropOffs.length === 0 ? (
                    <div className="card__body">
                      <div className="empty empty--tight">
                        <Scene name="tools" className="scene-ill scene-ill--sm" />
                        <div className="empty__title">Aucun dépôt en cours</div>
                        <p className="empty__body">
                          Les prestations en mode dépôt apparaîtront ici, avec l’heure promise.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="list" style={{ borderTop: 0 }}>
                      {dropOffs.slice(0, 4).map((row) => (
                        <Link
                          className="list__item list__item--link"
                          href={link(query, { view: "dropoffs", from: undefined })}
                          key={`drop-${row.appointment_id}`}
                        >
                          <span
                            className="choice__icon"
                            style={{
                              background: "var(--accent-soft)",
                              color: "var(--accent-strong)",
                            }}
                          >
                            <Icon name="mode-dropoff" />
                          </span>
                          <span className="grow">
                            <span className="t-sm t-strong">{row.customer.full_name}</span>
                            <br />
                            <span className="t-xs">
                              {row.service_name} · promis le{" "}
                              {/* Non-null: the filter above kept only rows that
                                  have one. */}
                              <strong className="t-strong">
                                {promised(row.ready_by as string, zone)}
                              </strong>
                            </span>
                          </span>
                          <Icon name="chevron-right" size={18} />
                        </Link>
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

                <div className="panel">
                  <div className="panel__head">
                    <div className="panel__title">Légende</div>
                  </div>
                  <div className="card__body" style={{ display: "grid", gap: "var(--s-3)" }}>
                    <Key colour="var(--warning)" label="À confirmer" icon="hourglass" />
                    <Key colour="var(--brand)" label="Confirmé" icon="check-circle" />
                    <Key colour="var(--accent)" label="Prêt" icon="inbox" />
                    <Key colour="var(--success)" label="Terminé" icon="check" />
                    <Key colour="var(--p-warm-300)" label="Annulé" icon="x-circle" />
                    <Key colour="var(--danger)" label="Absent" icon="ban" />
                  </div>
                </div>

                {/* Only when there is one. `listClosures` answers for a single
                    chair, so this is the week of the person being read - saying
                    whose is the difference between a fact and a guess. */}
                {upcoming.length > 0 ? (
                  <div className="panel">
                    <div className="panel__head">
                      <div>
                        <div className="panel__title">Fermetures à venir</div>
                        <div className="panel__sub">Celles de {chairName}.</div>
                      </div>
                    </div>
                    <div className="list" style={{ borderTop: 0 }}>
                      {upcoming.map((closure) => (
                        <div className="list__item" key={closure.closure_id}>
                          <span className="grow">
                            <span className="t-sm t-strong">{dateWords(closure.date)}</span>
                            <br />
                            <span className="t-xs">{closureWords(closure)}</span>
                          </span>
                          <Button label="Modifier" variant="ghost" size="sm" href="/dashboard/hours" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          )}

          <WalkInDialog services={services} team={bookable} me={me} back={back} />
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
 * form, pressing publish and being told what they should have done first. The
 * design gives this its own four-step route; there is no such route here, so
 * the thread lives at the head of the diary and leaves the moment the page is
 * live. A salon already trading does not need a tutorial, and one that never
 * leaves reads as a fault in the product.
 */
function Readiness({
  readiness,
  provider,
  services,
  team,
}: {
  readiness: ReadinessView;
  provider: ProviderProfile;
  services: ServiceOfferingPage;
  team: StaffView[];
}) {
  if (readiness.published) return null;

  const first = services.data[0];
  const bookable = team.find((person) => person.bookable && person.active);

  return (
    <>
      <div style={{ marginBottom: "var(--s-6)" }}>
        <Notice
          tone="warning"
          title="Votre page n’est pas encore publiée"
          actions={
            <a className="btn btn--secondary btn--sm" href="#preparation">
              <span className="btn__label--idle">
                {readiness.can_publish ? "Publier ma page" : "Voir ce qu’il manque"}
              </span>
            </a>
          }
        >
          {readiness.can_publish
            ? "Tout ce qu’il fallait est là. Il reste à la rendre visible."
            : "Tant que les conditions ci-dessous ne sont pas remplies, le serveur refuse la publication."}
        </Notice>
      </div>

      <div className="panel" id="preparation" style={{ marginBottom: "var(--s-6)" }}>
        <div className="panel__head">
          <div>
            <div className="panel__title">Publier votre page</div>
            <div className="panel__sub">
              Trois conditions, vérifiées par le serveur. Elles ne sont pas négociables.
            </div>
          </div>
        </div>
        <div className="card__body">
          <div style={{ marginBottom: "var(--s-5)" }}>
            {readiness.can_publish ? (
              <Notice tone="success" title="Votre page est prête">
                Tout est en place. Une fois publiée, elle sera visible de tous et votre QR code
                fonctionnera.
              </Notice>
            ) : (
              <Notice tone="warning" title="Votre page est presque prête">
                Il manque une chose avant de pouvoir publier. Nous ne proposons pas le bouton tant
                que le serveur refuserait la publication.
              </Notice>
            )}
          </div>

          <ul className="checklist">
            <Condition
              done={readiness.has_service}
              label="Une prestation active"
              hint={
                first
                  ? `${first.name} · ${money(first.price)}`
                  : "Ce qu’une cliente choisit. C’est elle qui porte la durée et le prix."
              }
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
                d'horaires" when the real problem is that everyone was stood
                down, a provider goes and fills in a week that was already
                there. */}
            <Condition
              done={readiness.has_bookable_staff}
              label="Une personne réservable"
              hint={
                bookable
                  ? bookable.display_name
                  : "Personne n’est encore marqué comme réservable"
              }
              href="/dashboard/team"
              cta="Mon équipe"
            />
          </ul>
        </div>
        <div className="card__foot">
          <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
            {readiness.can_publish ? (
              <>
                {/* The design presses publish here. Nothing publishes a page
                    but the profile form's own switch, so this is the way to
                    it rather than a second, quieter way of doing the same
                    write. */}
                <Button
                  label="Publier ma page"
                  variant="primary"
                  size="lg"
                  icon="globe"
                  href="/dashboard/profile"
                />
                <Button
                  label="Prévisualiser"
                  variant="secondary"
                  icon="eye"
                  href={`/p/${provider.slug}`}
                />
              </>
            ) : (
              <>
                <button className="btn btn--primary btn--lg" type="button" disabled>
                  <Icon name="globe" size={18} className="btn__icon--idle" />
                  <span className="btn__label--idle">Publier ma page</span>
                </button>
                <p className="t-xs" style={{ alignSelf: "center" }}>
                  Complétez l’élément manquant pour activer la publication.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card card--pad" style={{ marginBottom: "var(--s-6)" }}>
        <h2 className="t-h4">Ce que verront vos clients</h2>
        <div
          className="row"
          style={{ marginTop: "var(--s-4)", gap: "var(--s-4)", alignItems: "flex-start" }}
        >
          <div className="publink grow">
            <span className="publink__url">
              {provider.public_url ? spoken(provider.public_url) : `/p/${provider.slug}`}
            </span>
            {/* Only what the server sent. A whole address assembled here would
                be this application's guess at a domain, printed on a QR code. */}
            {provider.public_url ? (
              <button className="btn btn--ghost btn--sm" type="button" data-copy={provider.public_url}>
                <Icon name="copy" size={16} className="btn__icon--idle" />
                <span className="btn__label--idle">Copier le lien</span>
              </button>
            ) : null}
          </div>
        </div>
        <p className="t-xs" style={{ marginTop: "var(--s-3)" }}>
          <Icon name="lock" size={16} /> Cette adresse est définitive&nbsp;: elle figurera sur votre
          QR code et dans tous les messages déjà envoyés.
        </p>
      </div>
    </>
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
 * <p>Only the transitions the state machine accepts are offered. A button the
 * server would refuse teaches a provider that the dashboard is not to be
 * trusted.
 *
 * <p>`scope` only makes the dialogue identifiers unique. The same appointment
 * is drawn twice on this page - once in the queue of requests, once in the day
 * it falls on - and two dialogues sharing an id would open the wrong one.
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
  const chairId = `dlg-chair-${scope}-${id}`;

  return (
    <article className={`appt appt--${look.row}`}>
      <div>
        <div className="appt__time">{time(appointment.starts_at, zone)}</div>
        <div className="appt__dur">{lasts(appointment.starts_at, appointment.ends_at)}</div>
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

        {open ? (
          <>
            <CancelDialog
              id={id}
              dialogId={cancelId}
              back={back}
              name={appointment.customer.full_name}
            />
            <MoveDialog
              appointment={appointment}
              dialogId={moveId}
              back={back}
              zone={zone}
            />
            <ChairDialog
              appointment={appointment}
              dialogId={chairId}
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

            {open ? (
              <>
                <button className="menu__item" type="button" data-dialog-open={moveId}>
                  <Icon name="calendar" size={18} />
                  Déplacer
                </button>
                <button className="menu__item" type="button" data-dialog-open={chairId}>
                  <Icon name="users" size={18} />
                  Changer de personne
                </button>
                <span className="menu__sep" />
                {status === "CONFIRMED" ? (
                  <MenuVerb
                    action={markNoShow}
                    id={id}
                    back={back}
                    label="Marquer absent"
                    icon="ban"
                  />
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
 * not repeat the design's promise that a WhatsApp goes out carrying it.
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
                  placeholder="Empêchement, je vous rappelle pour reprogrammer."
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
 * The new hour.
 *
 * <p>The design offers a strip of days and a grid of free slots. Neither can be
 * drawn from what the API returns here: the slot list is published per service
 * offering, and an agenda row carries the service's frozen NAME and not its
 * identifier - so there is nothing to ask availability for. A wall-clock field
 * asks the provider directly, and the exclusion constraint arbitrates it
 * exactly as it would a chosen slot.
 *
 * <p>`staff_id` is sent unchanged so a pure move in time is a move that names
 * the same chair.
 */
function MoveDialog({
  appointment,
  dialogId,
  back,
  zone,
}: {
  appointment: AppointmentView;
  dialogId: string;
  back: string;
  zone: string;
}) {
  return (
    <dialog className="dialog" id={dialogId}>
      <div className="dialog__inner">
        <div className="dialog__head">
          <h2 className="dialog__title">Déplacer un rendez-vous</h2>
        </div>
        <form action={reschedule}>
          <input type="hidden" name="id" value={appointment.appointment_id} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="staff_id" value={appointment.staff_id} />
          <div className="dialog__body">
            <div
              className="card card--pad"
              style={{
                background: "var(--bg-sunken)",
                boxShadow: "none",
                marginBottom: "var(--s-6)",
              }}
            >
              <div className="dl">
                <div className="dl__row">
                  <span className="dl__key">Actuellement</span>
                  <span className="dl__val">
                    {dayWords(appointment.starts_at, zone)}, {time(appointment.starts_at, zone)} à{" "}
                    {time(appointment.ends_at, zone)}
                  </span>
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
            </div>

            <div className="field">
              <label className="field__label" htmlFor={`${dialogId}-when`}>
                Nouvel horaire
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
              <p className="field__hint">À votre montre.</p>
            </div>

            <div style={{ marginTop: "var(--s-6)" }}>
              <Notice tone="info" title="La cliente sera prévenue">
                Le prix et la prestation ne changent pas.
              </Notice>
            </div>
          </div>
          <div className="dialog__foot">
            <button className="btn btn--secondary" type="button" data-dialog-close>
              <span className="btn__label--idle">Annuler</span>
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

/**
 * The same operation, asked the other way round: keep the hour, change the
 * hands.
 *
 * <p>One API call for the two because the exclusion constraint keys on the
 * staff member - a change of chair is arbitrated as a booking on the new one
 * and releases the old in the same statement.
 *
 * <p>The design says only the people who perform this service and are free at
 * this hour are offered. Neither can be known here: the performers of an
 * offering are published per offering identifier, which an agenda row does not
 * carry, and there is no free-busy read at all. So everybody bookable is
 * offered and the server arbitrates - which it would have anyway.
 */
function ChairDialog({
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
          <h2 className="dialog__title">Changer de personne</h2>
        </div>
        <form action={reschedule}>
          <input type="hidden" name="id" value={appointment.appointment_id} />
          <input type="hidden" name="back" value={back} />
          {/* The hour does not move. The API takes a whole new start, so the
              one it already has is sent back unchanged. */}
          <input
            type="hidden"
            name="starts_at"
            value={localInput(appointment.starts_at, zone)}
          />
          <div className="dialog__body">
            <p>
              {appointment.customer.full_name} · {appointment.service_name} ·{" "}
              {time(appointment.starts_at, zone)}
            </p>
            <div className="stack" style={{ "--stack-gap": "var(--s-3)" } as React.CSSProperties}>
              {chairs(team, appointment).map((person) => (
                <label className="choice" key={person.staff_id}>
                  <input
                    type="radio"
                    name="staff_id"
                    value={person.staff_id}
                    defaultChecked={person.staff_id === appointment.staff_id}
                  />
                  <span className="choice__mark">
                    <Icon name="check-circle" />
                  </span>
                  <span className="choice__head">
                    <span className="avatar" aria-hidden="true">
                      {initials(person.display_name)}
                    </span>
                    <span>
                      <span className="choice__title">{person.display_name}</span>
                      <span className="choice__desc" style={{ marginTop: 0 }}>
                        {person.staff_id === appointment.staff_id
                          ? "Affectée actuellement"
                          : person.bookable
                            ? "Réservable"
                            : "Non réservable par les clients"}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="dialog__foot">
            <button className="btn btn--secondary" type="button" data-dialog-close>
              <span className="btn__label--idle">Annuler</span>
            </button>
            <button className="btn btn--primary" type="submit">
              <span className="btn__label--idle">Réaffecter</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

/* --- The week ------------------------------------------------------------- */

/**
 * Seven columns, and what is in each of them.
 *
 * <p>Not an occupancy grid: the design is explicit that no screen shows what a
 * named person does with their day. This is the same list of appointments, laid
 * out by the day it falls on, and one tap opens that day.
 */
function Week({
  rows,
  from,
  todayDay,
  zone,
  query,
  closures,
}: {
  rows: AppointmentView[];
  from: string;
  todayDay: string;
  zone: string;
  query: Query;
  closures: ClosureView[];
}) {
  const columns = Array.from({ length: 7 }, (_, index) => addDays(from, index));
  const shut = new Set(
    closures.filter((closure) => closure.kind === "CLOSED").map((closure) => closure.date),
  );

  return (
    <>
      <div className="week-wrap">
        <div className="week">
          {columns.map((date) => {
            const items = rows.filter((row) => dayKey(row.starts_at, zone) === date);
            return (
              <div className="week__col" key={date}>
                <div
                  className={
                    date === todayDay ? "week__colhead week__colhead--today" : "week__colhead"
                  }
                >
                  <div className="week__dow">{dowWords(date)}</div>
                  <div className="week__num">{Number(date.slice(8))}</div>
                  <div className="t-xs" style={{ marginTop: "2px" }}>
                    {/* "fermé" only where a closure says so. A day with nothing
                        in it is not a closed day, and there is no salon-wide
                        week to tell them apart. */}
                    {shut.has(date) ? "fermé" : `${items.length} rdv`}
                  </div>
                </div>
                <div className="week__body">
                  {items.length === 0 ? (
                    <p
                      className="t-xs"
                      style={{
                        textAlign: "center",
                        padding: "var(--s-6) 0",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      ·
                    </p>
                  ) : (
                    items.map((row) => (
                      <Link
                        className={`wappt appt--${lookOf(row).row}`}
                        href={link(query, { view: "day", from: date })}
                        key={row.appointment_id}
                      >
                        <span className="wappt__t">{time(row.starts_at, zone)}</span>{" "}
                        <span className="wappt__n">{shortName(row.customer.full_name)}</span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
        <Icon name="info" size={16} /> Faites défiler horizontalement sur petit écran. Toucher un
        rendez-vous ouvre sa journée.
      </p>
    </>
  );
}

/* --- The counter ---------------------------------------------------------- */

/**
 * What is physically in the shop, and what was promised for it.
 *
 * <p>The design gives this its own address; it is the same appointments, read
 * by their promise rather than by their hour, so it is a way of reading the
 * diary. A promise is not a period: a dress handed over in July and promised
 * for last Tuesday is exactly the row that must not fall off the bottom of a
 * date filter, so this list ignores the day being read.
 */
function Counter({
  rows,
  late,
  zone,
  back,
  clock,
}: {
  rows: AppointmentView[];
  late: number;
  zone: string;
  back: string;
  clock: number;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        sketch="tools"
        title="Aucun dépôt en cours"
        body="Les prestations en mode dépôt apparaîtront ici, avec l’heure promise."
      />
    );
  }

  return (
    <>
      {late > 0 ? (
        <div style={{ marginBottom: "var(--s-6)" }}>
          <Notice
            tone="warning"
            title={late > 1 ? "Des promesses sont dépassées" : "Une promesse est dépassée"}
          >
            Prévenez le client et déplacez la promesse plutôt que de la laisser passer en silence.
          </Notice>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel__head">
          <div className="panel__title">
            {rows.length} article{rows.length > 1 ? "s" : ""} au comptoir
          </div>
        </div>
        <div className="list" style={{ borderTop: 0 }}>
          {rows.map((row) => {
            const id = row.appointment_id;
            const promise = row.ready_by as string;
            const isLate = overdue(row, clock);
            const phone = row.customer.phone.replace(/\D/g, "");
            return (
              <div className="list__item" key={id}>
                <span
                  className="choice__icon"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                >
                  <Icon name="mode-dropoff" />
                </span>
                <div className="grow">
                  <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                    <span className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
                      {row.customer.full_name}
                    </span>
                    {row.ready_at ? (
                      <Badge label="Prêt à retirer" tone="success" icon="check-circle" />
                    ) : isLate ? (
                      <Badge label="Promesse dépassée" tone="danger" icon="alert-triangle" />
                    ) : (
                      <Badge label="En cours" tone="neutral" icon="hourglass" />
                    )}
                  </div>
                  <div className="t-xs" style={{ marginTop: "2px" }}>
                    {row.service_name} · déposé le {promised(row.starts_at, zone)} · promis le{" "}
                    <strong className="t-strong">{promised(promise, zone)}</strong>
                  </div>
                  <PromiseDialog
                    id={id}
                    dialogId={`dlg-promise-${id}`}
                    back={back}
                    readyBy={localInput(promise, zone)}
                    name={row.customer.full_name}
                  />
                </div>
                <div className="row" style={{ gap: "var(--s-2)" }}>
                  {row.ready_at ? (
                    <form action={handOver}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="back" value={back} />
                      <ActionButton
                        label="Remis au client"
                        type="submit"
                        variant="primary"
                        size="sm"
                      />
                    </form>
                  ) : (
                    <form action={markReady}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="back" value={back} />
                      <ActionButton
                        label="Marquer prêt"
                        type="submit"
                        variant="secondary"
                        size="sm"
                        icon="check"
                      />
                    </form>
                  )}
                  <details className="menu">
                    <summary className="btn btn--ghost btn--icon btn--sm" aria-label="Actions">
                      <Icon name="more-v" size={18} />
                    </summary>
                    <div className="menu__panel">
                      <button
                        className="menu__item"
                        type="button"
                        data-dialog-open={`dlg-promise-${id}`}
                      >
                        <Icon name="calendar" size={18} />
                        Déplacer la promesse
                      </button>
                      <a className="menu__item" href={`https://wa.me/${phone}`}>
                        <Icon name="whatsapp" size={18} />
                        Prévenir sur WhatsApp
                      </a>
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** "The machine broke, it will be Friday." */
function PromiseDialog({
  id,
  dialogId,
  back,
  readyBy,
  name,
}: {
  id: string;
  dialogId: string;
  back: string;
  readyBy: string;
  name: string;
}) {
  return (
    <dialog className="dialog" id={dialogId}>
      <div className="dialog__inner">
        <div className="dialog__head">
          <h2 className="dialog__title">Déplacer la promesse</h2>
        </div>
        <form action={movePromise}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={back} />
          <div className="dialog__body">
            <p>Ce que {name} attend, et quand vous vous engagez à le rendre.</p>
            <div className="field" style={{ marginTop: "var(--s-5)" }}>
              <label className="field__label" htmlFor={`${dialogId}-when`}>
                Nouvelle promesse
                <span className="field__req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                className="input"
                id={`${dialogId}-when`}
                type="datetime-local"
                name="ready_by"
                required
                defaultValue={readyBy}
              />
              <p className="field__hint">
                À votre montre. Elle ne peut pas tomber avant la remise au comptoir.
              </p>
            </div>
          </div>
          <div className="dialog__foot">
            <button className="btn btn--secondary" type="button" data-dialog-close>
              <span className="btn__label--idle">Garder la date</span>
            </button>
            <button className="btn btn--primary" type="submit">
              <span className="btn__label--idle">Déplacer la promesse</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

/* --- Somebody is standing at the counter ---------------------------------- */

/**
 * Somebody walked in, and it has to go in the book.
 *
 * <p>Not the public booking path, and the difference is the point: the
 * published hours and the notice period do not apply here. The provider is
 * writing in their own diary, and a diary that refuses to record what is
 * already happening is a diary the salon keeps on paper instead.
 *
 * <p>A dialogue rather than the design's own screen, because there is no route
 * for it here - it is opened from the bar at the top of every view.
 */
function WalkInDialog({
  services,
  team,
  me,
  back,
}: {
  services: ServiceOfferingPage;
  team: StaffView[];
  me: CurrentMember;
  back: string;
}) {
  const ready = team.length > 0 && services.data.length > 0;

  return (
    <dialog className="dialog" id="dlg-walkin">
      <div className="dialog__inner">
        <div className="dialog__head">
          <h2 className="dialog__title">Client sans rendez-vous</h2>
        </div>

        {ready ? (
          <form action={bookWalkIn}>
            <input type="hidden" name="back" value={back} />
            <div className="dialog__body">
              <p style={{ marginBottom: "var(--s-5)" }}>
                Il apparaîtra dans l’agenda et bloquera le créneau.
              </p>
              <Notice tone="info" title="Ici, c’est votre carnet">
                Vos horaires publiés et votre délai de prévenance ne s’appliquent pas&nbsp;: la
                seule chose qui reste refusée, c’est deux personnes sur la même chaise à la même
                heure.
              </Notice>

              <div className="field" style={{ marginTop: "var(--s-5)" }}>
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
                  placeholder="622 00 00 00"
                  aria-describedby="walkin-phone-hint"
                />
                {/* The design marks this optional. The contract does not: a
                    booking without a number is refused, and there is nowhere
                    for the confirmation to go. */}
                <p className="field__hint" id="walkin-phone-hint">
                  C’est par là que partent la confirmation et le rappel.
                </p>
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
                      {one.name} · {money(one.price)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cols cols--2" style={{ gap: "var(--s-5)" }}>
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
            <div className="dialog__foot">
              <button className="btn btn--secondary" type="button" data-dialog-close>
                <span className="btn__label--idle">Annuler</span>
              </button>
              <button className="btn btn--primary" type="submit">
                <Icon name="check" size={18} className="btn__icon--idle" />
                <span className="btn__label--idle">Enregistrer le rendez-vous</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="dialog__body">
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
            <div className="dialog__foot">
              <button className="btn btn--secondary" type="button" data-dialog-close>
                <span className="btn__label--idle">Fermer</span>
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
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

/** One line of the legend: the stripe, the word, the glyph. */
function Key({ colour, label, icon }: { colour: string; label: string; icon: string }) {
  return (
    <div className="row" style={{ gap: "var(--s-3)" }}>
      <span
        style={{ width: "3px", height: "18px", borderRadius: "2px", background: colour }}
        aria-hidden="true"
      />
      <span className="t-sm grow">{label}</span>
      <Icon name={icon} size={16} />
    </div>
  );
}

/* --- Reading the API ------------------------------------------------------ */

/**
 * The closures of one chair over the range being read.
 *
 * <p>A refusal costs the panel and nothing else. `listClosures` takes one staff
 * identifier and there is no salon-wide calendar to ask for, so a chair that
 * has been removed between two renders must not take the diary down with it.
 */
async function closuresOf(staffId: string, from: string, to: string): Promise<ClosureView[]> {
  try {
    const list = await api<ClosureList>("/v1/closures", {
      query: { staff_id: staffId, from, to },
    });
    return [...list.data].sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
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
 * A promise the provider has already broken.
 *
 * <p>Only while the work is still owed. Once it has been declared ready the
 * customer has been told to come, and the date it was promised for stops being
 * a debt.
 */
function overdue(row: AppointmentView, clock: number): boolean {
  return Boolean(row.ready_by) && !row.ready_at && Date.parse(row.ready_by as string) < clock;
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

/** "lundi 7 septembre", for the line that says where an appointment is now. */
function dayWords(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(instant));
}

/** The day an instant falls on, in the provider's zone. */
function dayKey(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(instant));
}

/** Before noon or after it, which is how the design labels a day. */
function halfOfDay(instant: string, timeZone: string): string {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
  return Number(hour) < 12 ? "morning" : "afternoon";
}

/** How long it occupies the chair: "1 h 15", "3 h", "45 min". */
function lasts(startsAt: string, endsAt: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

/** A diary is read by day, so it is drawn by day. The API already sorts. */
function byDay(
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

/* --- Reading a calendar date --------------------------------------------- */

/**
 * A `YYYY-MM-DD` read at noon UTC.
 *
 * <p>Noon and not midnight: a calendar date has no zone, and every arithmetic
 * on it here is in whole days. Starting in the middle of one means no offset
 * anywhere on earth can push it into the day before or the day after.
 */
function atNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

function addDays(date: string, count: number): string {
  const moved = new Date(atNoon(date).getTime() + count * 86_400_000);
  return moved.toISOString().slice(0, 10);
}

/** ISO weeks, so a week starts on Monday. */
function mondayOf(date: string): string {
  const weekday = atNoon(date).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

function minDay(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDay(a: string, b: string): string {
  return a > b ? a : b;
}

/** One day back or forward, or one week, depending on what is being read. */
function step(view: string, anchor: string, direction: number): string {
  return addDays(anchor, direction * (view === "week" ? 7 : 1));
}

/** "Semaine du 7 au 13 septembre 2026". */
function weekWords(from: string, to: string): string {
  const start = atNoon(from);
  const end = atNoon(to);
  const long = new Intl.DateTimeFormat("fr", { month: "long", timeZone: "UTC" });
  const tail = new Intl.DateTimeFormat("fr", { month: "long", year: "numeric", timeZone: "UTC" });
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  return sameMonth
    ? `Semaine du ${start.getUTCDate()} au ${end.getUTCDate()} ${tail.format(end)}`
    : `Semaine du ${start.getUTCDate()} ${long.format(start)} au ${end.getUTCDate()} ${tail.format(end)}`;
}

/** "Lun". The stylesheet puts it in capitals; the abbreviation's dot is ours. */
function dowWords(date: string): string {
  const short = new Intl.DateTimeFormat("fr", { weekday: "short", timeZone: "UTC" }).format(
    atNoon(date),
  );
  return short.replace(/\.$/, "");
}

/** "Dimanche 13 septembre", for a closure the provider declared. */
function dateWords(date: string): string {
  const words = new Intl.DateTimeFormat("fr", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(atNoon(date));
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What a closure does to a day.
 *
 * <p>The provider's own reason when they gave one, because it is what they will
 * recognise. The kind otherwise - the API has no third field saying when it was
 * declared, which is the only thing the design's second line adds.
 */
function closureWords(closure: ClosureView): string {
  if (closure.reason) return closure.reason;
  if (closure.kind === "CLOSED") return "Fermé toute la journée";
  const window = `${closure.start_time ?? ""} – ${closure.end_time ?? ""}`;
  return closure.kind === "CUSTOM_HOURS"
    ? `Horaires exceptionnels · ${window}`
    : `Indisponible · ${window}`;
}

/* --- Reading the query ---------------------------------------------------- */

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

/**
 * A link to this diary, read another way.
 *
 * <p>The cursor is deliberately dropped: it belongs to the page being left, and
 * carrying it would open the next view halfway through a result set it does not
 * describe.
 */
function link(query: Query, changes: Partial<Query>): string {
  const merged = { ...query, ...changes };
  const params = new URLSearchParams();
  for (const key of ["view", "from", "staff", "status"] as const) {
    const value = merged[key];
    if (value && !(key === "view" && value === "day")) params.set(key, value);
  }
  const search = params.toString();
  return search ? `/dashboard?${search}` : "/dashboard";
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

/* --- Reading a row -------------------------------------------------------- */

/**
 * The chairs an appointment may be moved to.
 *
 * <p>Its own is always among them even when that person has been deactivated:
 * the choice is pre-set to where the appointment already is, and an option the
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
    return { row: "at-customer", icon: "mode-atcustomer", label: "À domicile" };
  }
  if (appointment.ready_by) {
    return { row: "drop-off", icon: "mode-dropoff", label: "Dépôt" };
  }
  return { row: "on-site", icon: "mode-onsite", label: "Sur place" };
}

/** "Aminata Diallo" on a week column, where 120 px is the whole width. */
function shortName(full: string): string {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return full;
  return `${words[0]} ${(words[words.length - 1] ?? "").charAt(0)}.`;
}

/** The address a customer is given, without the part nobody reads out loud. */
function spoken(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
