import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicPageBody, pageUrl, tradeLabel } from "@/components/public-page";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";
import { ApiError, publicApi } from "@/lib/api";
import { env } from "@/lib/env";
import { mediaUrl } from "@/lib/format";
import type {
  CategoryList,
  PublicOpeningHours,
  PublicProvider,
  PublicStaffList,
  ReviewPage,
} from "@/lib/types";

/**
 * The page a customer opens from a link.
 *
 * <p>Nothing is cached: publishing a service or closing a Saturday must show
 * here on the next load, and this page is also what a provider checks after
 * every edit.
 *
 * <p>What it DRAWS lives in components/public-page.tsx, because the owner's
 * preview draws the same thing. This file is the loader, the metadata and the
 * chrome; everything a reader looks at is over there, once.
 */
export const dynamic = "force-dynamic";

/* --- Loading -------------------------------------------------------------- */

/**
 * The whole page, in one request.
 *
 * <p>`cache` is React's per-request memo, and it is here for a specific
 * reason: `generateMetadata` and the render below both need the provider, and
 * the API is told `no-store`, so without it every page view would fetch the
 * same four documents twice.
 *
 * <p>A 404 is not an error to display. The contract answers it both for a slug
 * nobody took and for a provider who has not published - deliberately, so the
 * page cannot say which - and both mean the same thing to a customer.
 */
const load = cache(async (slug: string) => {
  const at = `/v1/providers/${encodeURIComponent(slug)}`;
  try {
    const [provider, hours, staff, categories, reviews] = await Promise.all([
      publicApi<PublicProvider>(at),
      publicApi<PublicOpeningHours>(`${at}/opening-hours`),
      publicApi<PublicStaffList>(`${at}/staff`),
      // The trade travels as a slug. `dj-animation` is not a word to print at
      // a customer, and this is the only operation that carries the label.
      publicApi<CategoryList>("/v1/categories"),
      // The first page only. Somebody deciding whether to book reads a handful
      // and stops; loading every review a busy salon has ever collected would
      // cost every visitor on a 3G connection for the benefit of nobody.
      publicApi<ReviewPage>(`${at}/reviews?limit=6`),
    ]);
    return { provider, hours, staff, categories, reviews };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});

/* --- Metadata ------------------------------------------------------------- */

/**
 * What WhatsApp shows when the link is pasted into a conversation.
 *
 * <p>This is the product's whole distribution: a provider sends their link to
 * a group, and what the group sees is this. The tab said "Balaaca" and the
 * preview was blank, so every provider looked like every other one.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Page indisponible" };

  const provider = data.provider;
  const trade = tradeLabel(data.categories, provider.category_slug);
  const url = pageUrl(slug);
  // The cover first, the logo second: either is better than the blank square
  // a link with no image gets, and a logo at least identifies the business.
  const image = mediaUrl(provider.cover_url) ?? mediaUrl(provider.logo_url);

  const description =
    provider.description ??
    `${[trade, provider.city].filter(Boolean).join(" à ") || "Prestataire"}. ` +
      "Choisissez une prestation et réservez votre créneau en ligne, sans créer de compte.";

  return {
    // The layout's template appends " · Balaaca", so the tab reads the name of
    // the business and then the platform, in that order.
    title: provider.business_name,
    description,
    metadataBase: new URL(env.publicOrigin),
    alternates: { canonical: `/p/${slug}` },
    openGraph: {
      type: "website",
      siteName: "Balaaca",
      locale: "fr_FR",
      url,
      title: provider.business_name,
      description,
      images: image ? [{ url: new URL(image, env.publicOrigin).toString() }] : undefined,
    },
  };
}

/* --- Page ----------------------------------------------------------------- */

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await load(slug);
  // The design gives this state a screen of its own, and it is not the one a
  // mistyped URL gets - so it lives in this segment's not-found, where it also
  // carries the 404 the address deserves.
  if (!data) notFound();

  return (
    <>
      <SiteHeader />
      <PublicPageBody
        slug={slug}
        provider={data.provider}
        hours={data.hours}
        staff={data.staff}
        categories={data.categories}
        reviews={data.reviews}
      />
      <SiteFooter />
      <TabBar />
    </>
  );
}
