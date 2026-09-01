import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/icon";
import { ActionButton, Badge, Button, EmptyState, Notice, Wordmark } from "@/components/ui";
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

/** The one that is about somebody's safety rather than about money. */
const SEVERE = "RUDE_OR_UNSAFE";

/**
 * The two queues, side by side and never merged.
 *
 * <p>A customer complaining about an establishment and an establishment
 * answering the platform are different things: they arrive at different
 * moments, they are read at different moments, and one is answered with a
 * suspension while the other is answered by lifting one. Interleaving them
 * would make a single list that is urgent for two incompatible reasons.
 */
const QUEUES: [string, string][] = [
  ["REPORTS", "Signalements"],
  ["CONTESTATIONS", "Contestations"],
];

/** What each queue offers. Both open on the unanswered ones. */
const REPORT_VIEWS: [string, string][] = [
  ["PENDING", "À examiner"],
  ["REVIEWED", "Vus"],
  ["ALL", "Tous"],
];

const CONTESTATION_VIEWS: [string, string][] = [
  ["PENDING", "Non lues"],
  ["READ", "Lues"],
  ["ALL", "Toutes"],
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
 * operator comparing two rows needs them on the same one. It is theirs, named
 * on the page so that a date is never ambiguous.
 */
const OPERATOR_ZONE = "Africa/Conakry";

type Query = {
  queue?: string;
  status?: string;
  cursor?: string;
  error?: string;
};

/**
 * One page of whichever queue is open.
 *
 * <p>Discriminated rather than a bare union of the two pages: the caller knows
 * which list it asked for, and without the tag the rows would have to be told
 * apart by sniffing for a field, which is a guess about the contract.
 */
type Loaded =
  | { kind: "REPORTS"; page: ProviderReportPage }
  | { kind: "CONTESTATIONS"; page: ContestationPage };

/**
 * Moderation, as a screen instead of four curl commands.
 *
 * <p>The four operations existed and had no interface at all, which meant
 * moderating was typing a slug by hand with an angry provider on the telephone.
 * Here the slug is on the row, the lever is beside the complaint it answers,
 * and what the lever does - and does not do - is written above both.
 */
export default async function Moderation({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;

  const queue = QUEUES.find(([value]) => value === query.queue)?.[0] ?? "REPORTS";
  const answers = queue === "CONTESTATIONS";
  const views = answers ? CONTESTATION_VIEWS : REPORT_VIEWS;
  // A status belonging to the other queue arrives whenever somebody switches
  // lists with a filter already applied. It falls back rather than being sent
  // on: `REVIEWED` is not a value this endpoint's enum has.
  const view = views.find(([value]) => value === query.status)?.[0] ?? "PENDING";

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
  const shown = loaded.page.data.length;
  const noun = answers ? "contestation" : "signalement";

  return (
    <Shell queue={queue}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="t-h2">{answers ? "Contestations" : "Signalements"}</h1>
        <p className="t-body" style={{ marginTop: ".35rem" }}>
          {answers
            ? "Réponses envoyées par des établissements suspendus, les plus anciennes en premier."
            : "Ce que des clients reprochent à un établissement, les plus anciens en premier."}{" "}
          Les heures sont celles de Conakry.
        </p>
      </div>

      {query.error ? (
        <div style={{ marginBottom: "var(--s-5)" }}>
          <Notice tone="danger" title="La demande n’a pas abouti">
            {(answers ? CONTESTATION_REFUSALS[query.error] : undefined) ??
              REFUSALS[query.error] ??
              "Le serveur a refusé cette action."}
          </Notice>
        </div>
      ) : null}

      {/* Above the list, not inside the confirmation: an operator has to know
          what the lever does before they are looking at the button. */}
      <div style={{ marginBottom: "var(--s-5)" }}>
        {answers ? (
          <Notice tone="warning" title="Lire n’est pas donner raison" icon="eye">
            «&nbsp;Marquer comme lue&nbsp;» enregistre seulement que quelqu’un a
            ouvert le message. L’établissement reste suspendu, sa page reste hors
            de l’annuaire, et rien ne lui est répondu.{" "}
            <strong>
              «&nbsp;Rétablir&nbsp;» est l’autre bouton, et c’est le seul qui
              remet la page en ligne.
            </strong>{" "}
            Une contestation peut donc être lue et refusée&nbsp;: les deux gestes
            sont séparés parce que les deux décisions le sont.
          </Notice>
        ) : (
          <Notice tone="warning" title="Ce qu’une suspension fait, et ne fait pas" icon="ban">
            La page disparaît de l’annuaire et plus personne ne peut prendre de
            nouveau rendez-vous.{" "}
            <strong>
              Les rendez-vous déjà pris ne sont pas annulés&nbsp;: l’agenda reste
              entier et les clients gardent leurs références.
            </strong>{" "}
            Le motif est obligatoire, il part au journal d’audit et
            l’établissement le lit sur son propre tableau de bord. Plusieurs
            signalements peuvent viser le même établissement&nbsp;: le suspendre
            une fois suffit.
          </Notice>
        )}
      </div>

      {/* Links and not a select: a view is then a URL, so it can be sent to a
          colleague and the back button returns to the list being read. The
          cursor is deliberately absent - it belongs to the view being left, and
          carrying it would open the next one halfway through a result set it
          does not describe. */}
      <div className="toolbar" style={{ marginBottom: "var(--s-5)" }}>
        <span className="segmented">
          {views.map(([value, label]) => (
            <Link
              key={value}
              className={value === view ? "segmented__item is-active" : "segmented__item"}
              href={viewHref(queue, value)}
              aria-current={value === view ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </span>
        <span className="toolbar__spacer"></span>
        {shown > 0 ? (
          <span className="t-xs">
            {shown}
            {loaded.page.next_cursor ? "+" : ""} {noun}
            {shown > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {shown === 0 ? (
        <EmptyState
          sketch="notebook"
          title={
            view === "PENDING"
              ? answers
                ? "Aucune contestation en attente"
                : "Aucun signalement à examiner"
              : answers
                ? "Aucune contestation dans cette vue"
                : "Aucun signalement dans cette vue"
          }
          body={
            view === "PENDING"
              ? answers
                ? "Quand un établissement suspendu envoie une réponse, elle apparaît ici avec le motif de la suspension."
                : "Rien n’attend d’être regardé. C’est le bon état de cet écran."
              : "Les autres vues en contiennent peut-être."
          }
          action={
            view === "PENDING" ? null : (
              <Button label="Voir la file de travail" variant="secondary" href={root(queue)} />
            )
          }
        />
      ) : (
        <>
          <div className="stack" style={{ "--stack-gap": "var(--s-4)" } as CSSProperties}>
            {loaded.kind === "REPORTS"
              ? loaded.page.data.map((report) => (
                  <Report key={report.report_id} report={report} back={back} />
                ))
              : loaded.page.data.map((contestation) => (
                  <Contestation
                    key={contestation.contestation_id}
                    contestation={contestation}
                    back={back}
                  />
                ))}
          </div>

          {loaded.page.next_cursor ? (
            <div className="row" style={{ marginTop: "var(--s-6)" }}>
              <Button
                label="Voir la suite"
                variant="secondary"
                size="sm"
                iconEnd="arrow-right"
                href={nextPage(queue, view, loaded.page.next_cursor)}
              />
            </div>
          ) : null}
        </>
      )}
    </Shell>
  );
}

/**
 * The operator's chrome, and the switch between the two queues.
 *
 * <p>Drawn here rather than in the layout because which queue is open is a
 * search parameter, and a layout is never given one - so a bar drawn there
 * could not mark the entry the reader is standing on.
 */
function Shell({ queue, children }: { queue?: string; children: ReactNode }) {
  return (
    <div className="op">
      <div className="op__bar">
        <div className="op__bar-in">
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
        </div>
      </div>
      <main id="contenu" className="op__main">
        {children}

        <div className="row" style={{ marginTop: "var(--s-8)" }}>
          <span className="grow"></span>
          {/* POST, because a sign-out on GET is triggered by any image tag. */}
          <form method="post" action="/api/auth/logout">
            <ActionButton
              label="Se déconnecter"
              variant="ghost"
              size="sm"
              type="submit"
              icon="lock"
            />
          </form>
        </div>
      </main>
    </div>
  );
}

/**
 * One page of one queue.
 *
 * <p>`ALL` is the absence of the parameter rather than a value, because that is
 * what both endpoints publish: their enums have no such member, and sending it
 * would be a 400 on a filter the operator chose from a list this page drew.
 */
async function load(queue: string, view: string, cursor: string | undefined): Promise<Loaded> {
  const query = {
    status: view === "ALL" ? undefined : view,
    cursor: cursor || undefined,
    limit: 50,
  };
  if (queue === "CONTESTATIONS") {
    return {
      kind: "CONTESTATIONS",
      page: await api<ContestationPage>("/v1/admin/contestations", { query }),
    };
  }
  return { kind: "REPORTS", page: await api<ProviderReportPage>("/v1/admin/reports", { query }) };
}

/**
 * One complaint, and the two decisions it can lead to.
 *
 * <p>The booking is on the row - service, day, hour - because that is what
 * turns "somebody says something" into "this booking, that day", which is the
 * difference between an accusation and something an operator can check.
 */
function Report({ report, back }: { report: ProviderReportView; back: string }) {
  const pending = report.status === "PENDING";
  const suspended = report.provider_status === "SUSPENDED";
  const suspendId = `susp-${report.report_id}`;
  const reinstateId = `reinst-${report.report_id}`;

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
        {report.reason === SEVERE ? (
          <Badge label="Sécurité" tone="danger" icon="alert-triangle" />
        ) : null}
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
            {/* The mockup names the booking reference here. A report does not
                carry one, so the row is identified above by the service and the
                hour instead - the two things the API does send. */}
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
          <Button
            label="Voir la page publique"
            variant="ghost"
            size="sm"
            href={`/p/${report.provider_slug}`}
            icon="store"
          />
          <span className="grow"></span>
          {pending ? (
            <form action={reviewReport}>
              <input type="hidden" name="report_id" value={report.report_id} />
              <input type="hidden" name="back" value={back} />
              <ActionButton
                label="Marquer comme vu"
                type="submit"
                variant="secondary"
                size="sm"
                icon="check"
              />
            </form>
          ) : report.reviewed_at ? (
            <span className="t-xs">Examiné le {day(report.reviewed_at, OPERATOR_ZONE)}</span>
          ) : null}

          {/* Both levers when the contract's optional `provider_status` is
              absent. Guessing would hide the only one that helps: an
              establishment whose state did not travel would be offered a
              suspension it already has, and could never be put back from this
              screen. */}
          {suspended ? null : (
            <button className="btn btn--danger btn--sm" type="button" data-dialog-open={suspendId}>
              <Icon name="ban" size={16} className="btn__icon--idle" />
              <span className="btn__label--idle">Suspendre l’établissement</span>
            </button>
          )}
          {report.provider_status === "ACTIVE" ? null : (
            <button
              className="btn btn--primary btn--sm"
              type="button"
              data-dialog-open={reinstateId}
            >
              <Icon name="refresh" size={16} className="btn__icon--idle" />
              <span className="btn__label--idle">Rétablir l’établissement</span>
            </button>
          )}
        </div>
      </div>

      {suspended ? null : (
        <SuspendDialog id={suspendId} slug={report.provider_slug} back={back} />
      )}
      {report.provider_status === "ACTIVE" ? null : (
        <ReinstateDialog id={reinstateId} slug={report.provider_slug} back={back} />
      )}
    </article>
  );
}

/**
 * One business answering the platform, and where its suspension stands today.
 *
 * <p>Two dates, and they are not the same date. `about_suspension_at` is the
 * decision this message answers; `current_reason` is what the establishment
 * carries at this instant, which is gone once somebody put them back - and can
 * even be a later suspension, since a business can be suspended, contest, be
 * reinstated and be suspended again. Both are on the row so the operator can
 * see whether they are reading about something still true.
 */
function Contestation({
  contestation,
  back,
}: {
  contestation: ContestationQueueView;
  back: string;
}) {
  const pending = contestation.status === "PENDING";
  // `provider_status` is required here, unlike on a report, so the state is
  // known rather than inferred from the reason being absent.
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
              Suspendu le {day(contestation.about_suspension_at, OPERATOR_ZONE)}
              {" · "}
              réponse envoyée le {day(contestation.submitted_at, OPERATOR_ZONE)}
              {contestation.read_at ? ` · lue le ${day(contestation.read_at, OPERATOR_ZONE)}` : ""}
            </div>
          </div>
        </div>
        {suspended ? (
          <Badge label="Suspendu" tone="danger" icon="ban" />
        ) : (
          <Badge label="Déjà rétabli" tone="success" icon="refresh" />
        )}
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
          {/* Only once they are back. A suspended establishment's public page
              answers "introuvable" by design, and offering the link anyway
              would send the operator to a 404 on almost every row. */}
          {suspended ? null : (
            <Button
              label="Voir la page publique"
              variant="ghost"
              size="sm"
              href={`/p/${contestation.provider_slug}`}
              icon="store"
            />
          )}
          <span className="grow"></span>
          {pending ? (
            <form action={markContestationRead}>
              <input type="hidden" name="contestation_id" value={contestation.contestation_id} />
              <input type="hidden" name="back" value={back} />
              <ActionButton
                label="Marquer comme lue"
                type="submit"
                variant="secondary"
                size="sm"
                icon="check"
              />
            </form>
          ) : null}
          {suspended ? (
            <button
              className="btn btn--primary btn--sm"
              type="button"
              data-dialog-open={reinstateId}
            >
              <Icon name="refresh" size={16} className="btn__icon--idle" />
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
              réservations. Le motif disparaît de sa fiche&nbsp;; le journal
              d’audit garde la décision et sa date.
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

/** A queue at its first page, which is where switching lists should land. */
function root(queue: string): string {
  return `/admin?${new URLSearchParams({ queue }).toString()}`;
}

/** A view of the queue being read, from its first page. */
function viewHref(queue: string, view: string): string {
  return `/admin?${new URLSearchParams({ queue, status: view }).toString()}`;
}

/** The view a lever was pressed from, so the redirect comes back to it. */
function carry(queue: string, view: string, cursor: string | undefined): string {
  const params = new URLSearchParams({ queue, status: view });
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

/** The next page is this view plus the cursor the last one handed back. */
function nextPage(queue: string, view: string, cursor: string): string {
  const params = new URLSearchParams({ queue, status: view, cursor });
  return `/admin?${params.toString()}`;
}
