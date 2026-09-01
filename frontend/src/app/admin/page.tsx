import Link from "next/link";
import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon, Scene } from "@/components/icon";
import { Badge, Button, Notice, Wordmark, initials } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { dateTime, day } from "@/lib/format";
import type {
  ContestationPage,
  ContestationQueueView,
  ProviderReportPage,
  ProviderReportView,
} from "@/lib/types";
import {
  markContestationRead,
  reinstateProvider,
  reviewReport,
  suspendProvider,
} from "./actions";

/** A complaints queue. Cached, it would show one already answered. */
export const dynamic = "force-dynamic";

/**
 * What a refusal means, in words the operator can act on.
 *
 * <p>Keyed by the contract's own closed catalogue. The two 404s are one
 * message because the API deliberately does not distinguish them: suspending a
 * business already off the hub and suspending a slug that never existed are
 * the same answer, and pretending to know which would be inventing.
 */
const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Ce compte n’a plus le droit de modération. Reconnectez-vous.",
  VALIDATION_FAILED: "Le motif doit faire entre 3 et 500 caractères.",
  RESOURCE_NOT_FOUND:
    "Cet établissement est déjà dans l’état demandé, ou son adresse n’existe plus. Rechargez la page pour voir où il en est.",
  RATE_LIMITED: "Trop de demandes en même temps. Réessayez dans un instant.",
};

/**
 * The one code whose meaning changes with the queue.
 *
 * <p>Both suspension levers can be pressed from the contestations list too, so
 * a 404 there is either a message that moved or an establishment that did.
 * Naming only the establishment, as the reports queue does, would send the
 * operator looking for the wrong thing.
 */
const CONTESTATION_REFUSALS: Record<string, string> = {
  RESOURCE_NOT_FOUND:
    "Cette contestation, ou cet établissement, n’est plus dans l’état affiché. Rechargez la page.",
};

/**
 * The five things a customer in this market actually complains about, as a
 * reader sees them. The set is closed on both sides, so a reason arriving here
 * that is not in this map is a contract change nobody applied, and it renders
 * as itself rather than as a guess.
 */
const REASONS: Record<string, string> = {
  NO_SHOW: "Le professionnel ne s’est pas présenté",
  NOT_AS_DESCRIBED: "Prestation non conforme",
  OVERCHARGED: "Prix différent de celui annoncé",
  RUDE_OR_UNSAFE: "Comportement déplacé ou dangereux",
  OTHER: "Autre",
};

/**
 * The three screens of the console, in the design's own order.
 *
 * <p>The design draws them as three addresses; this application keeps one, so
 * they are three values of one parameter. The two queues stay distinct rather
 * than merged: a customer complaining about an establishment and an
 * establishment answering the platform are different things, they arrive at
 * different moments, and one is answered with a suspension while the other is
 * answered by lifting one.
 */
const QUEUES: [string, string][] = [
  ["REPORTS", "Signalements"],
  ["CONTESTATIONS", "Contestations"],
  ["BUSINESSES", "Établissements"],
];

/** The reports queue's three views, in the design's order. */
const REPORT_VIEWS: [string, string][] = [
  ["PENDING", "À examiner"],
  ["ALL", "Tous"],
  ["REVIEWED", "Vus"],
];

/**
 * What the lever does, written where the operator is about to pull it.
 *
 * <p>The third line is the one that is always misread. A suspension takes the
 * page off the hub; it does not call off a single appointment already booked,
 * and an operator who believes otherwise suspends thinking they are protecting
 * customers who are in fact still expected at the door.
 */
const SUSPENSION_EFFECTS: string[] = [
  "La page disparaît immédiatement de toutes les recherches et de l’annuaire.",
  "Aucune nouvelle réservation n’est acceptée.",
  "Les rendez-vous déjà pris restent valables : ils ne sont pas annulés.",
  "Le prestataire voit le motif et peut envoyer une réponse.",
];

/**
 * The clock this queue is read on.
 *
 * <p>Every other screen renders an instant in the provider's own zone, read
 * from their profile. A report carries no zone, and this queue crosses every
 * provider at once - so there is no one establishment's clock to use, and an
 * operator comparing two rows needs them on the same one.
 */
const OPERATOR_ZONE = "Africa/Conakry";

/** One page of a queue, and how much of it the table below is built from. */
const PAGE = 50;
const SWEEP = 200;

type Query = {
  queue?: string;
  status?: string;
  cursor?: string;
  q?: string;
  etat?: string;
  error?: string;
};

/**
 * One line of the establishments table.
 *
 * <p>Local because `@/lib/types` mirrors the contract and the contract has no
 * such projection: there is no operation that lists establishments, so this is
 * assembled from the two queues rather than read.
 */
type Establishment = {
  slug: string;
  name: string;
  status?: ProviderReportView["provider_status"];
};

/**
 * One page of whichever screen is open.
 *
 * <p>Discriminated rather than a bare union: the caller knows which list it
 * asked for, and without the tag the rows would have to be told apart by
 * sniffing for a field, which is a guess about the contract.
 */
type Loaded =
  | { kind: "REPORTS"; page: ProviderReportPage }
  | { kind: "CONTESTATIONS"; page: ContestationPage }
  | { kind: "BUSINESSES"; rows: Establishment[] };

/**
 * Moderation, as a screen instead of four curl commands.
 *
 * <p>The four operations existed and had no interface at all, which meant
 * moderating was typing a slug by hand with an angry provider on the telephone.
 * Here the slug is on the row, the lever is beside the complaint it answers,
 * and what the lever does - and does not do - is written in the confirmation.
 */
export default async function Moderation({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;

  const queue = QUEUES.find(([value]) => value === query.queue)?.[0] ?? "REPORTS";
  // A status belonging to another screen arrives whenever somebody switches
  // lists with a filter already applied. It falls back rather than being sent
  // on: `REVIEWED` is not a value the contestations endpoint's enum has.
  const view = REPORT_VIEWS.find(([value]) => value === query.status)?.[0] ?? "PENDING";

  // A provider who finds this address gets a plain sentence rather than a
  // stack trace. The scope is held by the operator alone, so 403 here is the
  // ordinary case for everybody else - and the queue names businesses and the
  // complaints against them, so it must not half-render on the way to failing.
  let loaded: Loaded;
  try {
    loaded = await load(queue, view, query.cursor);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Shell>
          <div style={{ marginBottom: "1.5rem" }}>
            <h1 className="t-h2">Modération</h1>
          </div>
          <Notice tone="warning" title="Cet espace est réservé à l’exploitant de la plateforme">
            Votre compte n’a pas le droit de modération.
          </Notice>
        </Shell>
      );
    }
    throw error;
  }

  // Carried through every lever so an action pressed on page two of the
  // reviewed list comes back to page two of the reviewed list.
  const back = carry(queue, view, query.cursor);

  return (
    <Shell queue={queue}>
      {loaded.kind === "REPORTS" ? (
        <Reports page={loaded.page} view={view} back={back} error={query.error} />
      ) : loaded.kind === "CONTESTATIONS" ? (
        <Contestations page={loaded.page} back={back} error={query.error} />
      ) : (
        <Businesses
          rows={loaded.rows}
          q={query.q ?? ""}
          etat={query.etat ?? ""}
          back={back}
          error={query.error}
        />
      )}
    </Shell>
  );
}

/**
 * The operator's chrome, and the switch between the three screens.
 *
 * <p>Drawn here rather than in the layout because which screen is open is a
 * search parameter, and a layout is never given one - so a bar drawn there
 * could not mark the entry the reader is standing on.
 *
 * <p>The design puts the operator's own address in the right-hand slot. Nothing
 * this application may call returns it - `/v1/me` resolves a provider
 * membership, which an operator does not have - so the slot carries the one
 * thing an operator needs there instead, and the console keeps a way out.
 */
function Shell({ queue, children }: { queue?: string; children: ReactNode }) {
  return (
    <div className="op">
      <div className="op__bar">
        <div className="op__bar-in">
          {/* The real monogram, not the mockup's letter tile: the brand sheet
              forbids an approximation of the mark, here as everywhere else. */}
          <Wordmark href="/admin" size={34} tone="inverse" hideText />
          <span className="op__tag">Modération</span>
          {queue ? (
            <nav className="op__nav" aria-label="Navigation modération">
              {QUEUES.map(([value, label]) => (
                <Link
                  key={value}
                  href={root(value)}
                  aria-current={value === queue ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
          ) : null}
          <div
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: ".5rem" }}
          >
            {/* POST, because a sign-out on GET is triggered by any image tag. */}
            <form method="post" action="/api/auth/logout">
              <button
                className="t-xs"
                type="submit"
                style={{ color: "var(--text-on-dark-muted)" }}
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </div>
      <main id="contenu" className="op__main">
        {children}
      </main>
    </div>
  );
}

/* --- Signalements -------------------------------------------------------- */

/**
 * What customers have reported, oldest first.
 *
 * <p>The design writes "2 signalements à examiner sur 4 au total". The total
 * does not exist: both queues are cursors over an ordered sequence and neither
 * publishes a count, so what is said is the number on the page - with a `+`
 * when there is another one - and nothing about a total nobody counted.
 */
function Reports({
  page,
  view,
  back,
  error,
}: {
  page: ProviderReportPage;
  view: string;
  back: string;
  error?: string;
}) {
  const shown = page.data.length;
  const more = page.next_cursor ? "+" : "";

  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="t-h2">Signalements</h1>
        <p className="t-body" style={{ marginTop: ".35rem" }}>
          {view === "PENDING" && shown > 0
            ? `${shown}${more} signalement${shown > 1 ? "s" : ""} à examiner. `
            : ""}
          Les plus anciens en premier.
        </p>
      </div>

      <Refusal code={error} />

      {/* Links and not a select: a view is then a URL, so it can be sent to a
          colleague and the back button returns to the list being read. The
          cursor is deliberately absent - it belongs to the view being left, and
          carrying it would open the next one halfway through a result set it
          does not describe. */}
      <div className="toolbar" style={{ marginBottom: "var(--s-5)" }}>
        <span className="segmented">
          {REPORT_VIEWS.map(([value, label]) => (
            <Link
              key={value}
              className={value === view ? "segmented__item is-active" : "segmented__item"}
              href={viewHref(value)}
              aria-current={value === view ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </span>
        <span className="toolbar__spacer"></span>
      </div>

      {shown === 0 ? (
        <div className="empty">
          <Scene name="notebook" className="scene-ill" />
          <div className="empty__title">
            {view === "PENDING"
              ? "Aucun signalement à examiner"
              : "Aucun signalement dans cette vue"}
          </div>
          <p className="empty__body">
            {view === "PENDING"
              ? "Rien n’attend d’être regardé. C’est le bon état de cet écran."
              : "Les autres vues en contiennent peut-être."}
          </p>
        </div>
      ) : (
        <>
          <div className="stack" style={{ "--stack-gap": "var(--s-4)" } as CSSProperties}>
            {page.data.map((report) => (
              <Report key={report.report_id} report={report} back={back} />
            ))}
          </div>

          {page.next_cursor ? (
            <div className="row" style={{ marginTop: "var(--s-6)" }}>
              <Button
                label="Voir la suite"
                variant="secondary"
                size="sm"
                iconEnd="arrow-right"
                href={nextPage("REPORTS", view, page.next_cursor)}
              />
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

/**
 * One complaint, and the two decisions it can lead to.
 *
 * <p>The design names the booking reference twice on this card. A report does
 * not carry one, so the row is identified by the service and the hour instead -
 * the two things the API does send, and enough to turn "somebody says
 * something" into "this booking, that day".
 */
function Report({ report, back }: { report: ProviderReportView; back: string }) {
  const pending = report.status === "PENDING";
  const suspended = report.provider_status === "SUSPENDED";
  const suspendId = `susp-${report.report_id}`;

  return (
    <article className="panel">
      <div className="panel__head">
        <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
          {pending ? (
            <Badge label="À examiner" tone="warning" icon="hourglass" />
          ) : (
            <Badge label="Vu" tone="neutral" icon="check" />
          )}
          <div>
            <div className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
              {REASONS[report.reason] ?? report.reason}
            </div>
            <div className="t-xs" style={{ marginTop: 2 }}>
              <Link className="link link--quiet" href={`/p/${report.provider_slug}`}>
                {report.provider_name}
              </Link>
              {" · "}
              {report.service_name} du {dateTime(report.appointment_starts_at, OPERATOR_ZONE)}
              {" · "}
              signalé le {day(report.reported_at, OPERATOR_ZONE)}
            </div>
          </div>
        </div>
        {/* The design fills this slot with the provider's answer to the report,
            which no operation carries. What can be said here is the one state
            that decides whether the lever below is offered at all. */}
        {suspended ? <Badge label="Suspendu" tone="danger" icon="ban" /> : null}
      </div>

      <div className="card__body" style={{ paddingBlock: "var(--s-5)" }}>
        {report.details ? (
          <blockquote
            style={{
              borderLeft: "3px solid var(--border-strong)",
              paddingLeft: "var(--s-4)",
              margin: 0,
            }}
          >
            <p className="t-body">{report.details}</p>
            <footer className="t-xs" style={{ marginTop: "var(--s-2)" }}>
              Client
            </footer>
          </blockquote>
        ) : (
          <p className="t-sm">Le client n’a rien écrit de plus.</p>
        )}
      </div>

      <div className="card__foot">
        <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
          <Link
            className="btn btn--ghost btn--sm"
            href={`/admin?${new URLSearchParams({
              queue: "BUSINESSES",
              q: report.provider_slug,
            }).toString()}`}
          >
            <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
              <Icon name="store" size={18} />
            </span>
            <span className="btn__label--idle">Voir l’établissement</span>
          </Link>
          <span className="grow"></span>
          {pending ? (
            <form action={reviewReport}>
              <input type="hidden" name="report_id" value={report.report_id} />
              <input type="hidden" name="back" value={back} />
              <button className="btn btn--secondary btn--sm" type="submit">
                <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                  <Icon name="check" size={18} />
                </span>
                <span className="btn__label--idle">Marquer comme vu</span>
                <span className="btn__icon--busy">
                  <Icon name="loader" size={18} className="ico--spin" />
                </span>
                <span className="btn__label--busy">…</span>
                <span className="btn__icon--done">
                  <Icon name="check" size={18} />
                </span>
                <span className="btn__label--done">Vu</span>
              </button>
            </form>
          ) : report.reviewed_at ? (
            <span className="t-xs">Examiné le {day(report.reviewed_at, OPERATOR_ZONE)}</span>
          ) : null}

          {/* Offered while the contract's optional `provider_status` is absent.
              Guessing would hide the only lever that helps; naming a state
              nobody sent would be worse. */}
          {pending && !suspended ? (
            <button className="btn btn--danger btn--sm" type="button" data-dialog-open={suspendId}>
              <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                <Icon name="ban" size={18} />
              </span>
              <span className="btn__label--idle">Suspendre l’établissement</span>
            </button>
          ) : null}
        </div>
      </div>

      {pending && !suspended ? (
        <SuspendDialog id={suspendId} slug={report.provider_slug} back={back} />
      ) : null}
    </article>
  );
}

/* --- Contestations ------------------------------------------------------- */

/**
 * What businesses have answered.
 *
 * <p>No filter above it, as the design draws it: the endpoint returns pending
 * first and oldest first, so the unread ones already lead and a queue this
 * short is read rather than searched.
 */
function Contestations({
  page,
  back,
  error,
}: {
  page: ContestationPage;
  back: string;
  error?: string;
}) {
  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="t-h2">Contestations</h1>
        <p className="t-body" style={{ marginTop: ".35rem" }}>
          Réponses envoyées par des établissements suspendus.
        </p>
      </div>

      <Refusal code={error} answers />

      {page.data.length === 0 ? (
        <div className="empty">
          <Scene name="notebook" className="scene-ill" />
          <div className="empty__title">Aucune contestation en attente</div>
          <p className="empty__body">
            Quand un établissement suspendu envoie une réponse, elle apparaît ici
            avec le motif de la suspension.
          </p>
        </div>
      ) : (
        <>
          <div className="stack" style={{ "--stack-gap": "var(--s-4)" } as CSSProperties}>
            {page.data.map((contestation) => (
              <Contestation
                key={contestation.contestation_id}
                contestation={contestation}
                back={back}
              />
            ))}
          </div>

          {page.next_cursor ? (
            <div className="row" style={{ marginTop: "var(--s-6)" }}>
              <Button
                label="Voir la suite"
                variant="secondary"
                size="sm"
                iconEnd="arrow-right"
                href={nextPage("CONTESTATIONS", "PENDING", page.next_cursor)}
              />
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

/**
 * One business answering the platform.
 *
 * <p>`current_reason` is the reason the establishment carries at this instant,
 * which is gone once somebody put them back - and can even be a later
 * suspension, since a business can be suspended, contest, be reinstated and be
 * suspended again. Its absence is therefore said in words rather than left as
 * an empty paragraph under a heading that promises a motive.
 */
function Contestation({
  contestation,
  back,
}: {
  contestation: ContestationQueueView;
  back: string;
}) {
  const pending = contestation.status === "PENDING";
  // Required here, unlike on a report, so the state is known rather than
  // inferred from the reason being absent.
  const suspended = contestation.provider_status === "SUSPENDED";
  const reinstateId = `reinst-c-${contestation.contestation_id}`;

  return (
    <article className="panel">
      <div className="panel__head">
        <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
          {pending ? (
            <Badge label="Non lue" tone="warning" icon="message" />
          ) : (
            <Badge label="Lue" tone="neutral" icon="check" />
          )}
          <div>
            <div className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
              {contestation.provider_name}
            </div>
            <div className="t-xs" style={{ marginTop: 2 }}>
              Réponse envoyée le {day(contestation.submitted_at, OPERATOR_ZONE)}
            </div>
          </div>
        </div>
        {suspended ? <Badge label="Suspendu" tone="danger" icon="ban" /> : null}
      </div>

      <div className="card__body">
        <div className="t-overline" style={{ marginBottom: "var(--s-2)" }}>
          Motif de la suspension
        </div>
        {contestation.current_reason ? (
          <p className="t-sm">{contestation.current_reason}</p>
        ) : (
          <p className="t-sm">
            Plus aucun motif sur sa fiche&nbsp;: la décision contestée a déjà été
            levée et la page est revenue dans l’annuaire.
          </p>
        )}

        <div className="t-overline" style={{ margin: "var(--s-5) 0 var(--s-2)" }}>
          Réponse de l’établissement
        </div>
        <blockquote
          style={{
            borderLeft: "3px solid var(--brand-border)",
            paddingLeft: "var(--s-4)",
            margin: 0,
          }}
        >
          <p className="t-body">{contestation.message}</p>
        </blockquote>
      </div>

      <div className="card__foot">
        <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
          {pending ? (
            <form action={markContestationRead}>
              <input type="hidden" name="contestation_id" value={contestation.contestation_id} />
              <input type="hidden" name="back" value={back} />
              <button className="btn btn--ghost btn--sm" type="submit">
                <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                  <Icon name="check" size={18} />
                </span>
                <span className="btn__label--idle">Marquer comme lue</span>
              </button>
            </form>
          ) : null}
          <span className="grow"></span>
          {suspended ? (
            <button
              className="btn btn--primary btn--sm"
              type="button"
              data-dialog-open={reinstateId}
            >
              <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                <Icon name="refresh" size={18} />
              </span>
              <span className="btn__label--idle">Rétablir l’établissement</span>
            </button>
          ) : null}
        </div>
      </div>

      {suspended ? (
        <ReinstateDialog id={reinstateId} slug={contestation.provider_slug} back={back} />
      ) : null}
    </article>
  );
}

/* --- Établissements ------------------------------------------------------ */

/**
 * The establishments moderation has jurisdiction over, and the lever detached
 * from any one complaint.
 *
 * <p>Assembled from the two queues, because no operation lists businesses: the
 * only public one, `GET /v1/providers`, is served by a database role that
 * cannot see an unpublished or suspended page - which is precisely the half
 * this table is for. So the rows are the establishments a report or a
 * contestation has named, and the footnote says so rather than letting the
 * table read as the whole directory.
 *
 * <p>The search and the state filter run over those rows, which is exactly what
 * the design's toolbar promises: neither endpoint takes a `q`.
 */
function Businesses({
  rows,
  q,
  etat,
  back,
  error,
}: {
  rows: Establishment[];
  q: string;
  etat: string;
  back: string;
  error?: string;
}) {
  const needle = q.trim().toLowerCase();
  const state = etat === "ACTIVE" || etat === "SUSPENDED" ? etat : "";
  const matching = rows.filter((row) => {
    if (state && row.status !== state) return false;
    if (!needle) return true;
    return (
      row.name.toLowerCase().includes(needle) ||
      `balaaca.gn/p/${row.slug}`.includes(needle)
    );
  });

  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="t-h2">Établissements</h1>
        <p className="t-body" style={{ marginTop: ".35rem" }}>
          Recherche par nom ou par adresse de page. Suspendre ou rétablir.
        </p>
      </div>

      <Refusal code={error} />

      {/* A GET form: the filter lives in the URL, so it survives the back
          button and can be handed to a colleague. Both controls are applied by
          the same submission. */}
      <form
        className="toolbar"
        style={{ marginBottom: "var(--s-5)" }}
        method="get"
        action="/admin"
      >
        <input type="hidden" name="queue" value="BUSINESSES" />
        <div className="input-group" style={{ maxWidth: "380px", flex: 1 }}>
          <span className="input-group__icon">
            <Icon name="search" size={18} />
          </span>
          <input
            className="input"
            type="search"
            name="q"
            defaultValue={q}
            autoComplete="off"
            placeholder="Nom ou balaaca.gn/p/…"
            aria-label="Rechercher un établissement"
          />
        </div>
        <span className="toolbar__spacer"></span>
        {/* The design offers a fourth state, "Brouillons". Nothing on either
            queue says whether a page was ever published, so the option is not
            drawn rather than drawn and unable to filter. */}
        <select
          className="select"
          name="etat"
          defaultValue={state}
          style={{ width: "auto", minHeight: 40, fontSize: "var(--fs-sm)" }}
          aria-label="Filtrer par état"
        >
          <option value="">Tous les états</option>
          <option value="ACTIVE">En ligne</option>
          <option value="SUSPENDED">Suspendus</option>
        </select>
      </form>

      {matching.length === 0 ? (
        <div className="empty">
          <Scene name="notebook" className="scene-ill" />
          <div className="empty__title">Aucun établissement à afficher</div>
          <p className="empty__body">
            Cette liste réunit les établissements qu’un signalement ou une
            contestation a nommés.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Établissement</th>
                <th>État</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {matching.map((row) => (
                <tr key={row.slug}>
                  <td>
                    <div className="row" style={{ gap: "var(--s-3)" }}>
                      <span className="avatar avatar--sm" aria-hidden="true">
                        {initials(row.name)}
                      </span>
                      <div>
                        <div className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
                          {row.name}
                        </div>
                        <div className="t-xs">balaaca.gn/p/{row.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {row.status === "SUSPENDED" ? (
                      <Badge label="Suspendu" tone="danger" icon="ban" />
                    ) : row.status === "ACTIVE" ? (
                      <Badge label="En ligne" tone="success" icon="globe" />
                    ) : (
                      <span className="t-xs">·</span>
                    )}
                  </td>
                  <td>
                    <details className="menu">
                      <summary className="btn btn--ghost btn--icon btn--sm" aria-label="Actions">
                        <Icon name="more-v" size={18} />
                      </summary>
                      <div className="menu__panel">
                        <Link className="menu__item" href={`/p/${row.slug}`}>
                          <Icon name="external" size={18} /> Voir la page
                        </Link>
                        <Link className="menu__item" href={root("REPORTS")}>
                          <Icon name="flag" size={18} /> Signalements
                        </Link>
                        <span className="menu__sep"></span>
                        {row.status === "SUSPENDED" ? null : (
                          <button
                            className="menu__item menu__item--danger"
                            type="button"
                            data-dialog-open={`susp-b-${row.slug}`}
                          >
                            <Icon name="ban" size={18} /> Suspendre
                          </button>
                        )}
                        {row.status === "ACTIVE" ? null : (
                          <button
                            className="menu__item"
                            type="submit"
                            form={`reinst-b-${row.slug}`}
                          >
                            <Icon name="refresh" size={18} /> Rétablir
                          </button>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
        Un établissement suspendu conserve son agenda et ses rendez-vous. La
        suspension retire la page publique, elle n’annule rien. Cette liste
        réunit les établissements qu’un signalement ou une contestation a nommés.
      </p>

      {/* Outside the table: a menu panel is positioned, and a form wrapped
          around one of its rows would be a box in the middle of the list. The
          `form` attribute binds the button to it natively, with no script. */}
      {matching.map((row) => (
        <Fragment key={row.slug}>
          {row.status === "ACTIVE" ? null : (
            <form action={reinstateProvider} id={`reinst-b-${row.slug}`}>
              <input type="hidden" name="slug" value={row.slug} />
              <input type="hidden" name="back" value={back} />
            </form>
          )}
          {row.status === "SUSPENDED" ? null : (
            <SuspendDialogShort id={`susp-b-${row.slug}`} slug={row.slug} back={back} />
          )}
        </Fragment>
      ))}
    </>
  );
}

/* --- Confirmations ------------------------------------------------------- */

/**
 * The confirmation, and the motive nobody can skip.
 *
 * <p>The motive is mandatory in the contract and required in the form, so the
 * refusal is not what teaches it. The day a provider contests the decision,
 * "who, when, why" has to exist, and a sentence written at the moment of the
 * decision is worth more than one reconstructed afterwards.
 */
function SuspendDialog({ id, slug, back }: { id: string; slug: string; back: string }) {
  return (
    <dialog className="dialog" id={id}>
      <div className="dialog__inner">
        <div className="dialog__head">
          <h2 className="dialog__title">Suspendre cet établissement&nbsp;?</h2>
        </div>
        <form action={suspendProvider}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="back" value={back} />
          <div className="dialog__body">
            <ul className="stack" style={{ "--stack-gap": "var(--s-2)" } as CSSProperties}>
              {SUSPENSION_EFFECTS.map((effect) => (
                <li
                  key={effect}
                  className="row"
                  style={{ alignItems: "flex-start", gap: "var(--s-3)" }}
                >
                  <span style={{ color: "var(--warning)", marginTop: 2 }}>
                    <Icon name="alert-triangle" size={16} />
                  </span>
                  <span className="t-sm">{effect}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: "var(--s-5)" }}>
              <div className="field">
                <label className="field__label" htmlFor={`${id}-reason`}>
                  Motif communiqué au prestataire
                  <span className="field__req" aria-hidden="true">
                    *
                  </span>
                </label>
                <textarea
                  className="textarea"
                  id={`${id}-reason`}
                  name="reason"
                  style={{ minHeight: 120 }}
                  required
                  minLength={3}
                  maxLength={500}
                  placeholder="Décrivez précisément ce qui est reproché et ce qui est attendu."
                />
                <p className="field__hint">
                  Ce texte est le seul que le prestataire verra. Il doit permettre
                  de comprendre et de corriger.
                </p>
              </div>
            </div>
          </div>
          <div className="dialog__foot">
            <button className="btn btn--secondary" type="button" data-dialog-close="">
              <span className="btn__label--idle">Annuler</span>
            </button>
            <button className="btn btn--danger" type="submit">
              <span className="btn__label--idle">Suspendre</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

/**
 * The same decision, taken from the list rather than from a complaint.
 *
 * <p>Shorter on purpose, as the design draws it: an operator suspending from
 * the table is not answering a particular report, and the one effect that is
 * always misread is still written above the field.
 */
function SuspendDialogShort({ id, slug, back }: { id: string; slug: string; back: string }) {
  return (
    <dialog className="dialog" id={id}>
      <div className="dialog__inner">
        <div className="dialog__head">
          <h2 className="dialog__title">Suspendre cet établissement&nbsp;?</h2>
        </div>
        <form action={suspendProvider}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="back" value={back} />
          <div className="dialog__body">
            <p>
              La page est retirée du public immédiatement. Les rendez-vous déjà
              pris restent valables.
            </p>
            <div style={{ marginTop: "var(--s-5)" }}>
              <div className="field">
                <label className="field__label" htmlFor={`${id}-reason`}>
                  Motif communiqué au prestataire
                  <span className="field__req" aria-hidden="true">
                    *
                  </span>
                </label>
                <textarea
                  className="textarea"
                  id={`${id}-reason`}
                  name="reason"
                  style={{ minHeight: 110 }}
                  required
                  minLength={3}
                  maxLength={500}
                />
              </div>
            </div>
          </div>
          <div className="dialog__foot">
            <button className="btn btn--secondary" type="button" data-dialog-close="">
              <span className="btn__label--idle">Annuler</span>
            </button>
            <button className="btn btn--danger" type="submit">
              <span className="btn__label--idle">Suspendre</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

/**
 * The undo, offered as plainly as the lever.
 *
 * <p>The first suspension made in a hurry will sometimes be wrong, and a
 * console that cannot undo its own decision does not have a moderation policy,
 * it has a delete button.
 */
function ReinstateDialog({ id, slug, back }: { id: string; slug: string; back: string }) {
  return (
    <dialog className="dialog" id={id}>
      <div className="dialog__inner">
        <div className="dialog__head">
          <h2 className="dialog__title">Rétablir cet établissement&nbsp;?</h2>
        </div>
        <form action={reinstateProvider}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="back" value={back} />
          <div className="dialog__body">
            <p>
              Sa page redevient immédiatement visible et accepte de nouvelles
              réservations. Les signalements restent consultables dans
              l’historique.
            </p>
          </div>
          <div className="dialog__foot">
            <button className="btn btn--secondary" type="button" data-dialog-close="">
              <span className="btn__label--idle">Annuler</span>
            </button>
            <button className="btn btn--primary" type="submit">
              <span className="btn__label--idle">Rétablir</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

/** What the last lever answered, when it refused. */
function Refusal({ code, answers }: { code?: string; answers?: boolean }) {
  if (!code) return null;
  return (
    <div style={{ marginBottom: "var(--s-5)" }}>
      <Notice tone="danger" title="La demande n’a pas abouti">
        {(answers ? CONTESTATION_REFUSALS[code] : undefined) ??
          REFUSALS[code] ??
          "Le serveur a refusé cette action."}
      </Notice>
    </div>
  );
}

/* --- Reading ------------------------------------------------------------- */

/**
 * One page of whichever screen is open.
 *
 * <p>`ALL` is the absence of the parameter rather than a value, because that is
 * what both endpoints publish: their enums have no such member, and sending it
 * would be a 400 on a filter the operator chose from a list this page drew.
 */
async function load(queue: string, view: string, cursor: string | undefined): Promise<Loaded> {
  if (queue === "CONTESTATIONS") {
    return {
      kind: "CONTESTATIONS",
      page: await api<ContestationPage>("/v1/admin/contestations", {
        query: { cursor: cursor || undefined, limit: PAGE },
      }),
    };
  }

  if (queue === "BUSINESSES") {
    const [reports, contestations] = await Promise.all([
      api<ProviderReportPage>("/v1/admin/reports", { query: { limit: SWEEP } }),
      api<ContestationPage>("/v1/admin/contestations", { query: { limit: SWEEP } }),
    ]);
    return { kind: "BUSINESSES", rows: establishments(reports, contestations) };
  }

  return {
    kind: "REPORTS",
    page: await api<ProviderReportPage>("/v1/admin/reports", {
      query: {
        status: view === "ALL" ? undefined : view,
        cursor: cursor || undefined,
        limit: PAGE,
      },
    }),
  };
}

/**
 * Every establishment the two queues name, once each.
 *
 * <p>A contestation's `provider_status` is required and a report's is optional,
 * so the contestation wins where both speak. Where neither does, the row
 * carries no state at all rather than a guessed one - and both levers stay
 * offered, because hiding one on a guess is how an establishment becomes
 * impossible to put back.
 */
function establishments(
  reports: ProviderReportPage,
  contestations: ContestationPage,
): Establishment[] {
  const rows = new Map<string, Establishment>();

  for (const report of reports.data) {
    const row = rows.get(report.provider_slug) ?? {
      slug: report.provider_slug,
      name: report.provider_name,
    };
    row.status = row.status ?? report.provider_status;
    rows.set(row.slug, row);
  }

  for (const contestation of contestations.data) {
    const row = rows.get(contestation.provider_slug) ?? {
      slug: contestation.provider_slug,
      name: contestation.provider_name,
    };
    row.status = contestation.provider_status;
    rows.set(row.slug, row);
  }

  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/* --- Addresses ----------------------------------------------------------- */

/** A screen at its first page, which is where switching lists should land. */
function root(queue: string): string {
  return `/admin?${new URLSearchParams({ queue }).toString()}`;
}

/** A view of the reports queue, from its first page. */
function viewHref(view: string): string {
  return `/admin?${new URLSearchParams({ queue: "REPORTS", status: view }).toString()}`;
}

/**
 * The view a lever was pressed from, so the redirect comes back to it.
 *
 * <p>The search and the state filter are deliberately absent: `actions.ts`
 * rebuilds the address from a known list of keys, and a lever pressed from a
 * filtered table returns to the whole one rather than to a URL this file and
 * that one disagree about.
 */
function carry(queue: string, view: string, cursor: string | undefined): string {
  const params = new URLSearchParams({ queue });
  if (queue === "REPORTS") params.set("status", view);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

/** The next page is this view plus the cursor the last one handed back. */
function nextPage(queue: string, view: string, cursor: string): string {
  const params = new URLSearchParams({ queue, cursor });
  if (queue === "REPORTS") params.set("status", view);
  return `/admin?${params.toString()}`;
}
