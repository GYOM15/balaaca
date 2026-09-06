import Link from "next/link";
import { Notice } from "@/components/ui";
import { PublicPageBody } from "@/components/public-page";
import { api, publicApi } from "@/lib/api";
import type { CategoryList, ProviderPreview, ReviewPage } from "@/lib/types";

/**
 * Your page, before anybody else can see it.
 *
 * <p>It exists because `/p/{slug}` resolves through a published-only lookup, so
 * a business that has not published has nothing there to look at. Four screens
 * linked to it anyway, and the worst was a "Prévisualiser" button sitting on a
 * card that only renders WHILE the page is unpublished: it could never have
 * worked, and it sat beside the button that would have fixed it.
 *
 * <p>One request, and it returns the SAME projection the public route returns.
 * Assembling this out of the dashboard's own endpoints was the alternative and
 * it is the one that rots: two sources of truth for one page, disagreeing on
 * the first change either side.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Aperçu de ma page · Balaaca" };

export default async function PreviewPage() {
  const [preview, categories] = await Promise.all([
    api<ProviderPreview>("/v1/provider-profile/preview"),
    // Public and unchanged: the trade travels as a slug, and `dj-animation` is
    // not a word to print at a customer.
    publicApi<CategoryList>("/v1/categories"),
  ]);

  // Reviews are not part of the preview and the empty page is honest rather
  // than convenient: what a stranger can read of an unpublished business is
  // nothing, so inventing an average here would be previewing a different page.
  const reviews: ReviewPage = { data: [], next_cursor: null };

  return (
    <>
      {/* A banner and not a badge. Somebody who forgets they are looking at a
          preview will press a button, find it inert, and blame the page. */}
      {/* The page below is full-bleed on purpose - it IS the public page, and
          it carries its own margins. Only this banner needs the dashboard's
          inner padding, or it sits flush against the sidebar. */}
      <div
        className="app__inner"
        // The gutter comes from .app__main on every other screen, and this page
        // has none: its body is the public page, full-bleed and carrying its
        // own margins. Only the banner needs them, so only the banner gets them.
        style={{ padding: "var(--s-6) var(--gutter) 0" }}
      >
        <Notice
          tone={preview.published ? "info" : "warning"}
          icon={preview.published ? "eye" : "eye-off"}
          title={
            preview.published
              ? "Votre page est en ligne. Voici ce que vos clients voient."
              : "Votre page n’est pas encore publiée. Voici ce qu’elle donnera."
          }
        >
          {preview.published ? (
            <>
              Les avis n’apparaissent pas dans cet aperçu.{" "}
              <Link className="link" href={`/p/${preview.provider.slug}`}>
                Ouvrir la vraie page
              </Link>
              .
            </>
          ) : (
            <>
              Personne d’autre ne peut l’ouvrir pour l’instant, et le bouton de
              réservation mène ici tant qu’elle n’est pas publiée.{" "}
              <Link className="link" href="/dashboard/profile">
                Publier ma page
              </Link>
              .
            </>
          )}
        </Notice>
      </div>

      <PublicPageBody
        slug={preview.provider.slug}
        provider={preview.provider}
        hours={preview.opening_hours}
        staff={preview.staff}
        categories={categories}
        reviews={reviews}
        preview={!preview.published}
      />
    </>
  );
}
