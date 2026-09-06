import type { CSSProperties } from "react";
import { Icon, Scene } from "@/components/icon";
import { StarRow } from "@/components/stars";
import { Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { day, mediaUrl } from "@/lib/format";
import type { ProviderReview, ProviderReviewPage } from "@/lib/types";
import { replyToReview, withdrawReviewReply } from "./actions";

/**
 * What customers said, and the one line a business may write back.
 *
 * <p>Reading includes the reviews an operator has taken down. A business that
 * cannot see what was said cannot answer the customer or ask for a takedown,
 * and one whose average moved without explanation would be right to think the
 * platform was hiding something.
 *
 * <p>There is no button here that writes, raises or deletes a review, and none
 * could be added: the database role has no such privilege. That is worth saying
 * on the screen itself, because it is the reason a star on this hub is worth
 * more than a star on a form anybody can fill in.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Avis · Balaaca" };

/** The refusals this screen can actually receive, in a sentence. */
const REFUSALS: Record<string, string> = {
  INVALID_STATE_TRANSITION:
    "Cet avis vient d’être retiré par l’équipe Balaaca. Il n’est plus sur votre page, et il n’y a plus rien à répondre.",
  VALIDATION_FAILED: "Tenez votre réponse en mille caractères au plus.",
  RESOURCE_NOT_FOUND: "Cet avis n’existe plus.",
  UNKNOWN: "Réessayez dans un instant.",
};

/** Conakry, like the rest of the dashboard. */
const ZONE = "Africa/Conakry";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; cursor?: string }>;
}) {
  const query = await searchParams;
  const page = await api<ProviderReviewPage>("/v1/reviews", {
    query: { cursor: query.cursor || undefined, limit: 20 },
  });

  const shown = page.data.length;

  return (
    <>
      {/* The dashboard's own shell: an appbar, then app__main / app__inner.
          Without it the content sits flush against the sidebar, which is what
          it did - every other screen in here carries this and it is not
          optional decoration, it is the page's margins. */}
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
            <h1 className="appbar__title">Avis</h1>
            <div className="appbar__sub">
              {shown === 0
                ? "Aucun avis pour l’instant"
                : `${shown}${page.next_cursor ? "+" : ""} avis, les plus récents en premier`}
            </div>
          </div>
          <div className="appbar__actions" />
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
      <div style={{ marginBottom: "var(--s-6)" }}>
        <p className="t-body">
          Seules les personnes qui ont réservé chez vous peuvent laisser un avis.
        </p>
      </div>

      {query.error ? (
        <div style={{ marginBottom: "var(--s-5)" }}>
          <Notice tone="danger" title="La réponse n’est pas enregistrée" errorCode={query.error}>
            {REFUSALS[query.error] ?? REFUSALS.UNKNOWN}
          </Notice>
        </div>
      ) : null}

      {query.saved ? (
        <div style={{ marginBottom: "var(--s-5)" }}>
          <Notice tone="success" title="C’est enregistré.">
            Votre réponse apparaît sous l’avis, sur votre page publique.
          </Notice>
        </div>
      ) : null}

      {page.data.length === 0 ? (
        <div className="empty">
          <Scene name="notebook" className="scene-ill" />
          <div className="empty__title">Aucun avis pour le moment</div>
          <p className="empty__body">
            Ils arrivent quand une cliente note une prestation déjà passée. Rien
            à faire de votre côté&nbsp;: on le lui propose sur sa réservation.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ "--stack-gap": "var(--s-4)" } as CSSProperties}>
          {page.data.map((review) => (
            <ReviewCard key={review.review_id} review={review} />
          ))}
        </div>
      )}

      {page.next_cursor ? (
        <div className="row" style={{ marginTop: "var(--s-6)" }}>
          <a
            className="btn btn--secondary btn--sm"
            href={`/dashboard/reviews?cursor=${encodeURIComponent(page.next_cursor)}`}
          >
            <span className="btn__label--idle">Voir la suite</span>
            <Icon name="arrow-right" size={18} className="ico--arrow" />
          </a>
        </div>
      ) : null}

      {/* Said on the screen, because it is the reason the stars mean anything -
          and because a provider reading a bad review will look for the delete
          button, and deserves to be told plainly that there is none rather than
          to hunt for it. */}
      <p className="t-xs" style={{ marginTop: "var(--s-8)", maxWidth: "60ch" }}>
        <Icon name="lock" size={16} /> Vous ne pouvez ni modifier ni supprimer un
        avis, et personne chez Balaaca ne le fera à votre place pour une note qui
        déplaît. Si un avis est mensonger ou insultant, écrivez-nous&nbsp;: il
        sera examiné. Vous pouvez toujours y répondre publiquement.
      </p>
        </div>
      </main>
    </>
  );
}

function ReviewCard({ review }: { review: ProviderReview }) {
  const hidden = review.status === "HIDDEN";

  return (
    <article className="panel">
      <div className="panel__head">
        <div className="row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
          <StarRow value={review.rating} size={18} />
          <span className="t-xs">
            {review.service_name} · {day(review.created_at, ZONE)}
          </span>
          {hidden ? (
            <span className="badge badge--neutral">
              <Icon name="eye-off" size={16} /> Retiré
            </span>
          ) : null}
        </div>
      </div>

      <div className="panel__body">
        {review.comment ? (
          <p className="review__text">{review.comment}</p>
        ) : (
          <p className="t-sm">Note seule, sans commentaire.</p>
        )}

        {review.photo_urls.length > 0 ? (
          <div className="review__photos" style={{ marginTop: "var(--s-4)" }}>
            {review.photo_urls.map((url) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={url} src={mediaUrl(url)} alt="" width={96} height={96} />
            ))}
          </div>
        ) : null}

        {hidden ? (
          <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
            Cet avis a été retiré par l’équipe Balaaca. Il n’est plus sur votre
            page, il ne compte plus dans votre note, et il ne peut plus recevoir
            de réponse.
          </p>
        ) : (
          <form action={replyToReview} style={{ marginTop: "var(--s-5)" }}>
            <input type="hidden" name="review_id" value={review.review_id} />
            <div className="field">
              <label className="field__label" htmlFor={`r-${review.review_id}`}>
                {review.reply ? "Votre réponse" : "Répondre publiquement"}
              </label>
              <textarea
                className="textarea"
                id={`r-${review.review_id}`}
                name="reply"
                maxLength={1000}
                defaultValue={review.reply ?? ""}
                style={{ minHeight: 96 }}
                aria-describedby={`h-${review.review_id}`}
              />
              <p className="field__hint" id={`h-${review.review_id}`}>
                Elle apparaît sous l’avis, sur votre page, signée de votre
                établissement. Répondre calmement à une critique convainc
                davantage que l’absence de réponse.
              </p>
            </div>

            <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
              <button className="btn btn--primary btn--sm" type="submit">
                <span className="btn__label--idle">
                  {review.reply ? "Enregistrer" : "Publier ma réponse"}
                </span>
                <span className="btn__icon--done">
                  <Icon name="check" size={18} />
                </span>
                <span className="btn__label--done">Enregistré</span>
              </button>
              {review.reply ? (
                <button
                  className="btn btn--ghost btn--sm"
                  type="submit"
                  formAction={withdrawReviewReply}
                >
                  <span className="btn__label--idle">Retirer ma réponse</span>
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </article>
  );
}
