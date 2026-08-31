import { Icon } from "@/components/icon";
import { ActionButton, Badge, Button, EmptyState, Notice, SectionHead } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { ProviderReportPage, ProviderReportView } from "@/lib/types";
import { reinstateProvider, reviewReport, suspendProvider } from "./actions";

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
    "Ce salon est déjà dans l’état demandé, ou son adresse n’existe plus. Rechargez la page pour voir où il en est.",
  RATE_LIMITED: "Trop de demandes en même temps. Réessayez dans un instant.",
};

/**
 * The five things a customer in this market actually complains about, as a
 * reader sees them. The set is closed on both sides, so a reason arriving here
 * that is not in this map is a contract change nobody applied, and it renders
 * as itself rather than as a guess.
 */
const REASONS: Record<string, string> = {
  NO_SHOW: "Rendez-vous non honoré",
  NOT_AS_DESCRIBED: "Prestation non conforme",
  OVERCHARGED: "Prix supérieur à celui annoncé",
  RUDE_OR_UNSAFE: "Comportement déplacé ou dangereux",
  OTHER: "Autre motif",
};

/** The one that is about somebody's safety rather than about money. */
const SEVERE = "RUDE_OR_UNSAFE";

/** What the queue offers. It opens on the unanswered ones. */
const VIEWS: [string, string][] = [
  ["PENDING", "En attente"],
  ["REVIEWED", "Déjà vus"],
  ["ALL", "Tous"],
];

/**
 * The clock this queue is read on.
 *
 * <p>Every other screen renders an instant in the provider's own zone, read
 * from their profile. A report carries no zone, and this queue crosses every
 * provider at once - so there is no one salon's clock to use, and an operator
 * comparing two rows needs them on the same one. It is theirs, named on the
 * page so that a date is never ambiguous.
 */
const OPERATOR_ZONE = "Africa/Conakry";

type Query = {
  status?: string;
  cursor?: string;
  error?: string;
};

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

  const view = VIEWS.find(([value]) => value === query.status)?.[0] ?? "PENDING";
  // A provider who finds this address gets a plain sentence rather than a
  // stack trace. The scope is held by the operator alone, so 403 here is the
  // ordinary case for everybody else - and the queue names businesses and the
  // complaints against them, so it must not half-render on the way to failing.
  let reports: ProviderReportPage;
  try {
    reports = await api<ProviderReportPage>("/v1/admin/reports", {
      query: {
        status: view === "ALL" ? undefined : view,
        cursor: query.cursor || undefined,
        limit: 50,
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <div className="stack stack-6">
          <SectionHead label="Modération" />
          <Notice tone="warning">
            Cet espace est réservé à l’exploitant de la plateforme.
          </Notice>
        </div>
      );
    }
    throw error;
  }

  // Carried through every lever so an action pressed on page two of the
  // reviewed list comes back to page two of the reviewed list.
  const back = carry(view, query.cursor);
  const shown = reports.data.length;

  return (
    <div className="container container--dashboard section stack stack-8">
      <header className="stack stack-2">
        <h1 className="t-h2">Signalements</h1>
        <p className="t-small t-muted measure">
          Ce que des clients reprochent à un salon, les plus anciens d’abord.
          Les heures sont celles de Conakry.
        </p>
      </header>

      {query.error ? (
        <Notice tone="danger" title="La demande n’a pas abouti">
          {REFUSALS[query.error] ?? "Le serveur a refusé cette action."}
        </Notice>
      ) : null}

      {/* Above the list, not inside the confirmation: an operator has to know
          what the lever does before they are looking at the button. */}
      <Notice tone="warning" title="Ce qu’une suspension fait, et ne fait pas" icon="ban">
        Le salon disparaît de l’annuaire&nbsp;: sa page et son lien de
        réservation répondent «&nbsp;introuvable&nbsp;», et plus personne ne peut
        prendre de nouveau rendez-vous.{" "}
        <strong>
          Les rendez-vous déjà pris ne sont pas annulés&nbsp;: le salon garde son
          agenda et ses clients gardent leurs références.
        </strong>{" "}
        Le motif est obligatoire, il part au journal d’audit et le salon le lit
        sur son propre tableau de bord — il apprend donc pourquoi sa page a
        disparu, au lieu de le découvrir parce que les clients cessent d’arriver.
        «&nbsp;Rétablir&nbsp;» remet la page en ligne et efface le motif de sa
        fiche&nbsp;; le journal, lui, le garde. Plusieurs signalements peuvent
        viser le même salon&nbsp;: le suspendre une fois suffit.
      </Notice>

      <section className="stack stack-4" aria-labelledby="filter-title">
        <SectionHead label="Filtrer" />
        {/* GET, so a view is a URL: it can be sent to a colleague, and the back
            button returns to the queue rather than to the default one. The
            cursor is deliberately absent from this form - it belongs to the
            view being left, and carrying it would open the next one halfway
            through a result set it does not describe. */}
        <form className="card card--pad stack stack-3" method="get" action="/admin">
          <h2 className="t-caption t-dim" id="filter-title">
            «&nbsp;En attente&nbsp;» est la file de travail&nbsp;: ce que
            personne n’a encore regardé.
          </h2>
          <div className="row row-3 row--wrap">
            <div className="field grow">
              <label className="field__label" htmlFor="filter-status">
                État
              </label>
              <select className="select" id="filter-status" name="status" defaultValue={view}>
                {VIEWS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <ActionButton label="Afficher" type="submit" variant="secondary" icon="filter" />
          </div>
        </form>
      </section>

      <section className="stack stack-4">
        <SectionHead
          label={VIEWS.find(([value]) => value === view)?.[1] ?? "Signalements"}
          aside={
            shown > 0
              ? `${shown}${reports.next_cursor ? "+" : ""} signalement${shown > 1 ? "s" : ""}`
              : undefined
          }
        />

        {shown === 0 ? (
          <EmptyState
            sketch="notebook"
            title="Aucun signalement"
            body={
              view === "PENDING"
                ? "Rien n’attend d’être regardé. C’est le bon état de cet écran."
                : "Rien dans cette vue. Les autres en contiennent peut-être."
            }
            action={
              view === "PENDING" ? null : (
                <Button label="Voir la file de travail" variant="secondary" href="/admin" />
              )
            }
          />
        ) : (
          <div className="stack stack-6">
            <div className="stack stack-4">
              {reports.data.map((report) => (
                <Report key={report.report_id} report={report} back={back} />
              ))}
            </div>

            {reports.next_cursor ? (
              <div className="row row-3">
                <Button
                  label="Voir la suite"
                  variant="secondary"
                  iconEnd="arrow-right"
                  href={nextPage(view, reports.next_cursor)}
                />
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
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

  return (
    <article className="card card--pad stack stack-4">
      <div className="row row--between row-3 row--wrap">
        <span className="grow stack stack-1">
          <strong className="t-body">{report.provider_name}</strong>
          <span className="t-caption t-dim">
            {report.service_name}
            {" · "}
            {dateTime(report.appointment_starts_at, OPERATOR_ZONE)}
          </span>
        </span>
        <Badge
          label={REASONS[report.reason] ?? report.reason}
          tone={report.reason === SEVERE ? "danger" : "warning"}
        />
        {pending ? (
          <Badge label="En attente" tone="outline" icon="clock" />
        ) : (
          <Badge label="Vu" tone="neutral" icon="check" />
        )}
        {suspended ? <Badge label="Salon suspendu" tone="danger" icon="ban" /> : null}
      </div>

      {report.details ? (
        <p className="t-small measure">«&nbsp;{report.details}&nbsp;»</p>
      ) : (
        <p className="t-caption t-dim">Le client n’a rien écrit de plus.</p>
      )}

      <p className="t-caption t-dim">
        Signalé le {dateTime(report.reported_at, OPERATOR_ZONE)}
        {report.reviewed_at ? ` · vu le ${dateTime(report.reviewed_at, OPERATOR_ZONE)}` : ""}
      </p>

      <div className="row row-3 row--wrap">
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
        ) : null}
        <Button
          label="Voir la page publique"
          variant="ghost"
          size="sm"
          href={`/p/${report.provider_slug}`}
          iconEnd="external"
        />
      </div>

      {/* Both levers when the contract's optional `provider_status` is absent.
          Guessing would hide the only one that helps: a salon whose state did
          not travel would be offered a suspension it already has, and could
          never be put back from this screen. */}
      {suspended ? null : <Suspend report={report} back={back} />}
      {report.provider_status === "ACTIVE" ? null : <Reinstate report={report} back={back} />}
    </article>
  );
}

/**
 * Behind a disclosure, and behind a motive nobody can skip.
 *
 * <p>The motive is mandatory in the contract and required in the form, so the
 * refusal is not what teaches it. The day a provider contests the decision,
 * "who, when, why" has to exist, and a sentence written at the moment of the
 * decision is worth more than one reconstructed afterwards.
 */
function Suspend({ report, back }: { report: ProviderReportView; back: string }) {
  return (
    <details className="card card--pad card--sunken stack stack-3">
      {/* The flex row is inside the summary rather than on it: `display: flex`
          on a summary is what removes the browser's own disclosure triangle,
          and the one control here that takes a salon off the hub should not be
          the one that looks like a sentence. */}
      <summary>
        <span className="row row-2">
          <Icon name="ban" size={16} />
          <span className="t-small">Suspendre ce salon</span>
        </span>
      </summary>

      <form action={suspendProvider} className="stack stack-3">
        <input type="hidden" name="slug" value={report.provider_slug} />
        <input type="hidden" name="back" value={back} />
        <label className="field">
          <span className="field__label">
            Motif
            <span className="field__req" aria-hidden="true">
              *
            </span>
          </span>
          <textarea
            className="textarea"
            name="reason"
            rows={2}
            required
            minLength={3}
            maxLength={500}
            placeholder="Trois clients signalent des rendez-vous non honorés."
          />
        </label>
        <p className="field__hint">
          <Icon name="info" size={14} /> {report.provider_name} lira ce motif sur
          son tableau de bord. Ses rendez-vous déjà pris ne sont pas annulés.
        </p>
        <ActionButton label="Suspendre ce salon" type="submit" variant="danger" icon="ban" />
      </form>
    </details>
  );
}

/**
 * The undo, offered as plainly as the lever.
 *
 * <p>The first suspension made in a hurry will sometimes be wrong, and a
 * console that cannot undo its own decision does not have a moderation policy,
 * it has a delete button.
 */
function Reinstate({ report, back }: { report: ProviderReportView; back: string }) {
  return (
    <details className="card card--pad card--sunken stack stack-3">
      <summary>
        <span className="row row-2">
          <Icon name="refresh" size={16} />
          <span className="t-small">Rétablir</span>
        </span>
      </summary>

      <form action={reinstateProvider} className="stack stack-3">
        <input type="hidden" name="slug" value={report.provider_slug} />
        <input type="hidden" name="back" value={back} />
        <p className="field__hint">
          <Icon name="info" size={14} /> La page de {report.provider_name}{" "}
          revient dans l’annuaire et le motif disparaît de sa fiche. Le journal
          d’audit garde la décision et sa date.
        </p>
        <ActionButton label="Rétablir" type="submit" variant="secondary" icon="refresh" />
      </form>
    </details>
  );
}

/** The view a lever was pressed from, so the redirect comes back to it. */
function carry(view: string, cursor: string | undefined): string {
  const params = new URLSearchParams({ status: view });
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

/** The next page is this view plus the cursor the last one handed back. */
function nextPage(view: string, cursor: string): string {
  const params = new URLSearchParams({ status: view, cursor });
  return `/admin?${params.toString()}`;
}
