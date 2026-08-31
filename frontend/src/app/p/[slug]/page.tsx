import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Icon } from "@/components/icon";
import { Sketch, sketchForTrade } from "@/components/sketch";
import { Button, EmptyState, SectionHead, Wordmark, initials } from "@/components/ui";
import { ApiError, publicApi } from "@/lib/api";
import { env } from "@/lib/env";
import { mediaUrl, money } from "@/lib/format";
import type {
  CategoryList,
  PublicOpeningHours,
  PublicProvider,
  PublicServiceOffering,
  PublicStaffList,
} from "@/lib/types";
import "./provider-page.css";

/**
 * The page a customer opens from a link.
 *
 * <p>Nothing is cached: publishing a service or closing a Saturday must show
 * here on the next load, and this page is also what a provider checks after
 * every edit.
 */
export const dynamic = "force-dynamic";

/** ISO numbering, as `PublicOpeningHoursSegment.day_of_week` uses it: 1 is Monday. */
const DAY_NAMES = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];

/** What `Intl` answers for a weekday in `en-US`, in the same ISO order. */
const WEEKDAY_CODES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Segment = PublicOpeningHours["data"][number];

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
    const [provider, hours, staff, categories] = await Promise.all([
      publicApi<PublicProvider>(at),
      publicApi<PublicOpeningHours>(`${at}/opening-hours`),
      publicApi<PublicStaffList>(`${at}/staff`),
      // The trade travels as a slug. `dj-animation` is not a word to print at
      // a customer, and this is the only operation that carries the label.
      publicApi<CategoryList>("/v1/categories"),
    ]);
    return { provider, hours, staff, categories };
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
  if (!data) return { title: "Page introuvable" };

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
  if (!data) notFound();

  const { provider, hours, staff, categories } = data;
  const trade = tradeLabel(categories, provider.category_slug);
  const cover = mediaUrl(provider.cover_url);
  const logo = mediaUrl(provider.logo_url);
  const bookHref = `/p/${slug}/reserver`;
  const week = weekOf(hours.data);
  const today = todayIndex(hours.timezone);
  const from = cheapest(provider.services);

  return (
    <div className="pub">
      <header className="pub-cover on-dark">
        {cover ? (
          <>
            {/* Plain img, not next/image: the bytes come through this server's
                own /media route, already sized and immutable. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pub-cover__photo" src={cover} alt="" />
            <span className="pub-cover__scrim" aria-hidden="true" />
          </>
        ) : (
          <span className="pub-cover__art" aria-hidden="true">
            {/* The drawing of THIS trade. The mockup drew braids for everyone,
                which tells a caterer's customer they found a hairdresser. */}
            <Sketch name={sketchForTrade(provider.category_slug)} level={3} width={300} />
          </span>
        )}

        <div
          className="container container--landing stack stack-6"
          style={{ position: "relative", zIndex: 1 }}
        >
          {/* The wordmark and nothing else. It is the way back to the hub, and
              the mockup's other control was a share button that needs
              JavaScript to do anything - the share card below does it with a
              link instead. */}
          <Wordmark tone="inverse" size={26} />
          <p className="t-label">
            {[trade, provider.city].filter(Boolean).join(" · ") || "Prestataire"}
          </p>
        </div>
      </header>

      <main className="container container--landing pub-id" id="contenu">
        <div className="pub-id__card stack stack-4">
          <div className="row row--top row-4">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="avatar avatar--xl avatar--photo pub-id__avatar"
                src={logo}
                alt=""
                width={88}
                height={88}
              />
            ) : (
              <span className="avatar avatar--xl pub-id__avatar" aria-hidden="true">
                {initials(provider.business_name)}
              </span>
            )}
            <div className="grow stack stack-2" style={{ paddingTop: "var(--space-2)" }}>
              <h1 className="pub-id__name">{provider.business_name}</h1>
              {trade ? <p className="t-body t-muted">{trade}</p> : null}
            </div>
          </div>

          {/* Rendered only when there is something in it. An empty flex row is
              still a row: it opened a gap in the card of every provider who
              had filled in nothing but their name. */}
          {provider.address_line || provider.city || provider.public_phone_e164
            || provider.whatsapp_phone_e164 ? (
          <div className="pub-meta">
            {provider.address_line || provider.city ? (
              <span className="pub-meta__item">
                <Icon name="map-pin" size={16} />
                {[provider.address_line, provider.city].filter(Boolean).join(", ")}
              </span>
            ) : null}
            {provider.public_phone_e164 ? (
              <a className="pub-meta__item" href={`tel:${provider.public_phone_e164}`}>
                <Icon name="phone" size={16} />
                {provider.public_phone_e164}
              </a>
            ) : null}
            {provider.whatsapp_phone_e164 ? (
              <a
                className="pub-meta__item"
                href={whatsAppHref(
                  provider.whatsapp_phone_e164,
                  provider.business_name,
                  pageUrl(slug),
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="message" size={16} />
                WhatsApp
              </a>
            ) : null}
          </div>
          ) : null}

          {/* Under 1024 px the sticky bar at the foot of the page carries this
              same action, so this one is the copy a reader meets on the way
              down rather than the only way to book. */}
          <div className="pub-narrow-only">
            <Button
              label="Réserver un créneau"
              variant="primary"
              size="lg"
              block
              iconEnd="arrow-right"
              href={bookHref}
            />
          </div>
        </div>

        <div
          className="pub-split"
          style={{ paddingBlock: "var(--space-10) var(--space-16)" }}
        >
          <div className="stack stack-12" style={{ maxWidth: "var(--width-editorial)" }}>
            <section className="stack stack-4" id="prestations">
              <SectionHead
                label="Prestations"
                aside={
                  provider.services.length > 0
                    ? `${provider.services.length} au catalogue`
                    : undefined
                }
              />
              {provider.services.length === 0 ? (
                <EmptyState
                  sketch="tools"
                  compact
                  title="Aucune prestation publiée"
                  body="Ce professionnel n'a pas encore mis son catalogue en ligne. Son numéro est plus haut."
                />
              ) : (
                <ul className="list">
                  {provider.services.map((service) => {
                    const photo = mediaUrl(service.photos?.[0]);
                    return (
                      <li key={service.service_offering_id}>
                        <Link
                          className="svc-row"
                          href={`${bookHref}?service=${encodeURIComponent(service.service_offering_id)}`}
                        >
                          {/* The first photo and only the first. A provider may
                              publish five per service and this page is read on a
                              phone over 3G: a catalogue of twenty services would
                              pull a hundred images to show a price list. */}
                          {photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              className="avatar avatar--photo"
                              src={photo}
                              alt={`Photo de la prestation ${service.name}`}
                              width={48}
                              height={48}
                              loading="lazy"
                              decoding="async"
                            />
                          ) : null}
                          <span className="grow stack stack-2">
                            <span className="svc-row__name">{service.name}</span>
                            {service.description ? (
                              <span className="svc-row__desc">{service.description}</span>
                            ) : null}
                            <span className="svc-row__facts">
                              {/* `price` is ABSENT when the provider chose not to
                                  publish it - the projection has no field at all,
                                  so there is no zero to mistake for free. */}
                              {service.price ? (
                                <span className="svc-row__price">{money(service.price)}</span>
                              ) : (
                                <span className="svc-row__price svc-row__price--ask">
                                  Prix sur demande
                                </span>
                              )}
                              <span className="svc-row__dot" aria-hidden="true" />
                              <span className="svc-row__dur">
                                <Icon name="clock" size={13} />
                                {duration(service.duration_minutes)}
                              </span>
                            </span>
                          </span>
                          <span className="svc-row__go" aria-hidden="true">
                            <Icon name="chevron-right" size={20} />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {provider.description ? (
              <section className="stack stack-4">
                <SectionHead label="À propos" />
                <p className="t-body t-muted measure" style={{ fontWeight: 400 }}>
                  {provider.description}
                </p>
              </section>
            ) : null}

            <section className="stack stack-4" id="horaires">
              <SectionHead label="Horaires" />
              <div>
                {week.map((day) => (
                  <div
                    key={day.iso}
                    className={
                      day.iso === today ? "hours-row hours-row--today" : "hours-row"
                    }
                  >
                    <span className="hours-row__day">
                      {DAY_NAMES[day.iso - 1]}
                      {day.iso === today ? (
                        <span className="t-caption t-dim"> · aujourd'hui</span>
                      ) : null}
                    </span>
                    {day.segments.length === 0 ? (
                      <span className="hours-row__closed">Fermé</span>
                    ) : (
                      <span className="hours-row__val">
                        {day.segments
                          .map((s) => `${s.start_time} – ${s.end_time}`)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="t-caption t-dim">
                Les jours fériés et les fermetures exceptionnelles n'apparaissent pas
                ici&nbsp;: les créneaux proposés à la réservation en tiennent compte.
              </p>
            </section>

            {staff.data.length > 0 ? (
              <section className="stack stack-4">
                <SectionHead label="L'équipe" />
                <ul className="row row-4 row--wrap">
                  {staff.data.map((member) => (
                    <li className="row row-3" key={member.staff_id}>
                      <span className="avatar avatar--sm" aria-hidden="true">
                        {initials(member.display_name)}
                      </span>
                      <span className="t-small">{member.display_name}</span>
                    </li>
                  ))}
                </ul>
                <p className="t-caption t-dim">
                  Vous pourrez demander une personne en particulier au moment de choisir
                  votre créneau.
                </p>
              </section>
            ) : null}

            <section className="card card--pad stack stack-4">
              <div className="stack stack-1">
                <h2 className="t-h4">Partager cette page</h2>
                <p className="t-small t-muted" style={{ fontWeight: 400 }}>
                  Le lien ouvre directement cette page, sans installation ni compte.
                </p>
              </div>
              <div className="row row-2 row--wrap">
                <Button
                  label="Envoyer sur WhatsApp"
                  variant="secondary"
                  icon="message"
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Réservez chez ${provider.business_name} : ${pageUrl(slug)}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </div>
            </section>
          </div>

          <aside className="pub-aside stack stack-4">
            <div className="card card--pad stack stack-4">
              <div className="stack stack-1">
                <p className="t-label t-label--accent">Réservation</p>
                <p className="t-h4">Choisissez une prestation, une date, un créneau.</p>
              </div>
              {from ? (
                <p className="t-small t-muted" style={{ fontWeight: 400 }}>
                  À partir de <strong className="tnum">{money(from)}</strong>
                </p>
              ) : null}
              <Button
                label="Réserver un créneau"
                variant="primary"
                size="lg"
                block
                iconEnd="arrow-right"
                href={bookHref}
              />
              <p className="t-caption t-dim" style={{ textAlign: "center" }}>
                Sans créer de compte. Aucun paiement en ligne.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* The thumb's reach on a phone. It is the last element of `.pub`, sticks
          to the bottom of the viewport, and the container query hides it once
          the aside above appears. */}
      <div className="actionbar pub-narrow-only">
        <div className="grow stack" style={{ gap: 0 }}>
          <span className="t-caption t-dim">{provider.business_name}</span>
          <span className="t-small">{todayLine(week, today)}</span>
        </div>
        <Button label="Réserver" variant="primary" iconEnd="arrow-right" href={bookHref} />
      </div>
    </div>
  );
}

/* --- Reading the data ----------------------------------------------------- */

/** The trade in French. Absent slug, or one the taxonomy withdrew, shows nothing. */
function tradeLabel(categories: CategoryList, slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return categories.data.find((c) => c.slug === slug)?.label_fr;
}

/**
 * The seven days, each with the stretches the API published for it.
 *
 * <p>The contract sends a flat list of segments and a day may carry several -
 * a salon that closes for lunch is two of them - so a day is built here rather
 * than assumed to be one row. A day with none is closed, which is the only way
 * the shape says so.
 */
function weekOf(segments: Segment[]): { iso: number; segments: Segment[] }[] {
  return [1, 2, 3, 4, 5, 6, 7].map((iso) => ({
    iso,
    segments: segments
      .filter((s) => s.day_of_week === iso)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));
}

/**
 * Which day it is where the provider is, not where this server runs.
 *
 * <p>The hours are written in the provider's own zone, so a Conakry salon read
 * from a node in Paris would mark the wrong row for two hours every night.
 * Returns 0 - matching no day - for a zone `Intl` refuses.
 */
function todayIndex(timeZone: string): number {
  try {
    const code = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(
      new Date(),
    );
    return WEEKDAY_CODES.indexOf(code) + 1;
  } catch {
    return 0;
  }
}

/** What the sticky bar says under the name: the hours of the day being lived. */
function todayLine(week: { iso: number; segments: Segment[] }[], today: number): string {
  const day = week.find((d) => d.iso === today);
  if (!day) return "Réservation en ligne";
  if (day.segments.length === 0) return "Fermé aujourd'hui";
  const first = day.segments[0];
  const last = day.segments[day.segments.length - 1];
  return first && last ? `Aujourd'hui ${first.start_time} – ${last.end_time}` : "Ouvert aujourd'hui";
}

/**
 * The lowest published price, for the "à partir de" line.
 *
 * <p>Only services that carry a price are considered. A service whose price is
 * withheld is not a cheap one, and treating a missing field as zero would
 * advertise a salon as starting at nothing.
 */
function cheapest(services: PublicServiceOffering[]): PublicServiceOffering["price"] {
  let best: PublicServiceOffering["price"];
  for (const service of services) {
    const price = service.price;
    if (!price) continue;
    if (!best || price.amount_minor < best.amount_minor) best = price;
  }
  return best;
}

/* --- Writing the data ----------------------------------------------------- */

/** Non-breaking spaces: "2 h 30" must never break across two lines. */
function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours} h`
    : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** The address the customer is standing on, as this server is reached from outside. */
function pageUrl(slug: string): string {
  return new URL(`/p/${slug}`, env.publicOrigin).toString();
}

/**
 * A conversation, opened on the number the provider published.
 *
 * <p>wa.me takes the number in digits with no plus and no separator, and
 * answers "phone number shared via url is invalid" for anything else - which
 * is what an E.164 string pasted straight in produces.
 */
function whatsAppHref(e164: string, businessName: string, url: string): string {
  const digits = e164.replace(/\D/g, "");
  const text = `Bonjour ${businessName}, j'ai vu votre page sur Balaaca et je souhaite réserver. ${url}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
