import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Icon, Scene, TradeIcon } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";
import { Avatar, initials } from "@/components/ui";
import { ApiError, publicApi } from "@/lib/api";
import { env } from "@/lib/env";
import { mediaUrl, money } from "@/lib/format";
import type {
  CategoryList,
  Fulfilment,
  Money,
  PublicOpeningHours,
  PublicProvider,
  PublicServiceOffering,
  PublicStaffList,
} from "@/lib/types";

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
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

/** What `Intl` answers for a weekday in `en-US`, in the same ISO order. */
const WEEKDAY_CODES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The three shapes a service can take, as a customer reads them.
 *
 * <p>Fixed order rather than the catalogue's, so a provider who sells all
 * three does not get a different row of badges every time they reorder their
 * services. The contract's enum is closed, and this map is exhaustive over it.
 */
const MODES: Record<
  Fulfilment,
  { className: string; icon: string; label: string; how: string }
> = {
  ON_SITE: {
    className: "mode--on-site",
    icon: "mode-onsite",
    label: "Sur place",
    how: "Vous vous rendez chez le prestataire et la prestation est réalisée pendant que vous attendez.",
  },
  DROP_OFF: {
    className: "mode--drop-off",
    icon: "mode-dropoff",
    label: "Dépôt",
    how: "Vous déposez l’article, vous repassez le récupérer une fois le travail terminé.",
  },
  AT_CUSTOMER: {
    className: "mode--at-customer",
    icon: "mode-atcustomer",
    label: "À domicile",
    how: "Le prestataire se déplace jusqu’à l’adresse que vous indiquez.",
  },
};

const MODE_ORDER: Fulfilment[] = ["ON_SITE", "DROP_OFF", "AT_CUSTOMER"];

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

  const { provider, hours, staff, categories } = data;
  const category = provider.category_slug;
  const trade = tradeLabel(categories, category);
  const cover = mediaUrl(provider.cover_url);
  const logo = mediaUrl(provider.logo_url);
  const bookHref = `/p/${slug}/reserver`;
  const url = pageUrl(slug);
  const week = weekOf(hours.data);
  const today = todayIndex(hours.timezone);
  const place = placeOf(provider);
  const modes = modesOf(provider.services);
  const whatsApp = provider.whatsapp_phone_e164;

  return (
    <>
      <SiteHeader />
      <main id="contenu" className="has-tabbar">
        {/* No drawing behind an absent cover: the design system gives `.pcover`
            a slot for a photograph and none for anything else, and the grain
            on the dark ground is what carries the band without one. */}
        <div className="pcover atmo grain grain--dark">
          {cover ? (
            /* Plain img, not next/image: the bytes come through this server's
               own /media route, already sized and immutable. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" width={1600} height={500} />
          ) : null}
        </div>

        <div className="page phead">
          <div className="phead__card">
            <div className="phead__logo">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt={`Logo de ${provider.business_name}`}
                  width={88}
                  height={88}
                />
              ) : (
                <span className="avatar avatar--xl" aria-hidden="true">
                  {initials(provider.business_name)}
                </span>
              )}
            </div>

            <div className="grow">
              {category && trade ? (
                <p className="t-overline t-overline--accent">
                  <TradeIcon slug={category} size={16} /> {trade}
                </p>
              ) : null}
              <h1 className="t-h1" style={{ marginTop: "var(--s-2)" }}>
                {provider.business_name}
              </h1>

              {place || staff.data.length > 0 ? (
                <div className="t-meta" style={{ marginTop: "var(--s-3)" }}>
                  {place ? (
                    <span>
                      <Icon name="pin" size={16} /> {place}
                    </span>
                  ) : null}
                  {staff.data.length > 0 ? (
                    <span>
                      <Icon name="users" size={16} />{" "}
                      {staff.data.length === 1
                        ? "1 personne sur rendez-vous"
                        : `${staff.data.length} personnes sur rendez-vous`}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div
                className="row row--wrap"
                style={{ marginTop: "var(--s-4)", gap: "var(--s-2)" }}
              >
                <TodayBadge week={week} today={today} />
                {modes.map((mode) => (
                  <span key={mode} className={`mode ${MODES[mode].className}`}>
                    <Icon name={MODES[mode].icon} />
                    {MODES[mode].label}
                  </span>
                ))}
              </div>
            </div>

            <div className="phead__actions">
              <Link className="btn btn--primary btn--lg btn--block" href={bookHref}>
                <span className="btn__label--idle">Réserver une prestation</span>
                <Icon name="arrow-right" size={18} className="ico--arrow" />
              </Link>
              {whatsApp ? (
                <a className="btn btn--secondary btn--block" href={whatsAppHref(whatsApp)}>
                  <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                    <Icon name="whatsapp" size={18} />
                  </span>
                  <span className="btn__label--idle">Écrire sur WhatsApp</span>
                </a>
              ) : null}
              <div className="row" style={{ gap: "var(--s-2)" }}>
                {provider.public_phone_e164 ? (
                  <a
                    className="btn btn--ghost grow"
                    href={`tel:${provider.public_phone_e164}`}
                  >
                    <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                      <Icon name="phone" size={18} />
                    </span>
                    <span className="btn__label--idle">Appeler</span>
                  </a>
                ) : null}
                {/* The copy itself is presentation.tsx's, through the attribute.
                    Nothing here reads a value and nothing ships a handler. */}
                <button className="btn btn--ghost grow" type="button" data-copy={url}>
                  <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                    <Icon name="share" size={18} />
                  </span>
                  <span className="btn__label--idle">Partager</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <nav className="panchors" aria-label="Sections de la page">
          <div className="page panchors__in">
            <a className="tab is-active" href="#services">
              Prestations{" "}
              <span className="count count--quiet">{provider.services.length}</span>
            </a>
            {staff.data.length > 0 ? (
              <a className="tab" href="#team">
                L’équipe
              </a>
            ) : null}
            <a className="tab" href="#hours">
              Horaires
            </a>
            <a className="tab" href="#info">
              Infos pratiques
            </a>
          </div>
        </nav>

        <section className="section" id="services" style={{ paddingBlock: "var(--s-10)" }}>
          <div className="page">
            <div className="cols cols--main-aside">
              <div>
                <div className="section-head" style={{ marginBottom: "var(--s-4)" }}>
                  <div className="section-head__text">
                    <h2 className="t-h2">Prestations</h2>
                    <p className="t-body">
                      Chaque ligne mène directement à la réservation de cette prestation.
                    </p>
                  </div>
                </div>

                {/* One shape is not a choice: a catalogue that is only at-home
                    shows no filter at all, which is what the design does. */}
                {modes.length > 1 ? (
                  <div className="row row--wrap" style={{ marginBottom: "var(--s-2)" }}>
                    <span className="chip is-active">Toutes</span>
                    {modes.map((mode) => (
                      <span key={mode} className="chip">
                        <Icon name={MODES[mode].icon} size={16} /> {MODES[mode].label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {provider.services.length === 0 ? (
                  <div className="empty">
                    <Scene name="tools" className="scene-ill" />
                    <div className="empty__title">Aucune prestation publiée</div>
                    <p className="empty__body">
                      Ce professionnel n’a pas encore mis son catalogue en ligne.
                    </p>
                    {whatsApp ? (
                      <div className="empty__actions">
                        <a className="btn btn--primary" href={whatsAppHref(whatsApp)}>
                          <span className="btn__label--idle">
                            Lui demander ce qu’il propose
                          </span>
                        </a>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div data-reveal-group>
                    {provider.services.map((service) => (
                      <ServiceRow
                        key={service.service_offering_id}
                        service={service}
                        bookHref={bookHref}
                      />
                    ))}
                  </div>
                )}

                <p className="t-xs" style={{ marginTop: "var(--s-5)" }}>
                  Les prix affichés sont ceux pratiqués aujourd’hui. Le prix d’une
                  réservation est figé au moment où vous réservez.
                </p>
              </div>

              {modes.length > 0 ? (
                <aside className="sticky-aside">
                  <div className="panel">
                    <div className="panel__head">
                      <div>
                        <div className="panel__title">Comment ça se passe</div>
                      </div>
                    </div>
                    <div
                      className="card__body"
                      style={{ display: "grid", gap: "var(--s-4)" }}
                    >
                      {modes.map((mode) => (
                        <div
                          key={mode}
                          className="row"
                          style={{ alignItems: "flex-start", gap: "var(--s-3)" }}
                        >
                          <span
                            className="choice__icon"
                            style={{ width: "34px", height: "34px" }}
                          >
                            <Icon name={MODES[mode].icon} size={18} />
                          </span>
                          <div>
                            <div className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
                              {MODES[mode].label}
                            </div>
                            <p className="t-xs" style={{ marginTop: "2px" }}>
                              {MODES[mode].how}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="card__foot">
                      <Link className="btn btn--primary btn--block" href={bookHref}>
                        <span className="btn__label--idle">Choisir une prestation</span>
                      </Link>
                    </div>
                  </div>
                </aside>
              ) : null}
            </div>
          </div>
        </section>

        {staff.data.length > 0 ? (
          <section
            className="section section--sunken"
            id="team"
            style={{ paddingBlock: "var(--s-10)" }}
          >
            <div className="page">
              <div className="section-head" style={{ marginBottom: "var(--s-6)" }}>
                <div className="section-head__text">
                  <h2 className="t-h2">L’équipe</h2>
                  <p className="t-body">
                    Vous pouvez demander une personne en particulier au moment de
                    réserver.
                  </p>
                </div>
              </div>
              <div className="trades" data-reveal-group>
                {staff.data.map((member) => (
                  <div className="trade" style={{ cursor: "default" }} key={member.staff_id}>
                    <Avatar name={member.display_name} />
                    <span className="grow">
                      <span className="trade__name">{member.display_name}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="section atmo tex-rules" style={{ paddingBlock: "var(--s-10)" }}>
          <div className="page">
            <div className="cols cols--2" style={{ gap: "var(--s-10)" }} data-reveal-group>
              <div id="hours">
                <h2 className="t-h3" style={{ marginBottom: "var(--s-5)" }}>
                  Horaires d’ouverture
                </h2>
                <div className="hours">
                  {week.map((day) => (
                    <div
                      key={day.iso}
                      className={
                        day.iso === today ? "hours__row hours__row--today" : "hours__row"
                      }
                    >
                      <span className="hours__day">
                        {DAY_NAMES[day.iso - 1]}
                        {day.iso === today ? " · aujourd’hui" : null}
                      </span>
                      {day.segments.length === 0 ? (
                        <span className="hours__val hours__val--closed">Fermé</span>
                      ) : (
                        <span className="hours__val">
                          {day.segments
                            .map((s) => `${s.start_time} – ${s.end_time}`)
                            .join(" · ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
                  Les créneaux proposés à la réservation tiennent compte des fermetures
                  exceptionnelles.
                </p>
              </div>

              <div id="info">
                <h2 className="t-h3" style={{ marginBottom: "var(--s-5)" }}>
                  Infos pratiques
                </h2>
                <div className="dl dl--lined">
                  {place ? (
                    <div className="dl__row">
                      <span className="dl__key">Adresse</span>
                      <span className="dl__val">{place}</span>
                    </div>
                  ) : null}
                  {/* `address_line` is the landmark, not a street number: it is
                      the field the dashboard labels "Repères" and the one a
                      customer navigates by here. */}
                  {provider.address_line ? (
                    <div className="dl__row">
                      <span className="dl__key">Repères</span>
                      <span className="dl__val" style={{ maxWidth: "32ch" }}>
                        {provider.address_line}
                      </span>
                    </div>
                  ) : null}
                  {provider.public_phone_e164 ? (
                    <div className="dl__row">
                      <span className="dl__key">Téléphone</span>
                      <span className="dl__val">{phone(provider.public_phone_e164)}</span>
                    </div>
                  ) : null}
                  <div className="dl__row">
                    <span className="dl__key">Page publique</span>
                    <span className="dl__val">{pageLabel(slug)}</span>
                  </div>
                </div>
                {provider.description ? (
                  <p className="t-body" style={{ marginTop: "var(--s-6)" }}>
                    {provider.description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section
          className="section section--dark on-dark atmo grain grain--dark tex-halo tex-halo--dark"
          style={{ paddingBlock: "var(--s-12)" }}
        >
          <div
            className="page"
            style={{
              display: "grid",
              gap: "var(--s-6)",
              justifyItems: "center",
              textAlign: "center",
            }}
          >
            <h2 className="t-h2" style={{ color: "#fff", maxWidth: "20ch" }}>
              Prendre rendez-vous chez {provider.business_name}
            </h2>
            <p
              className="t-lead"
              style={{ color: "var(--text-on-dark-muted)", maxWidth: "48ch" }}
            >
              Choisissez la prestation, la personne et l’horaire. Pas de compte à créer,
              une référence à garder.
            </p>
            <Link className="btn btn--inverse btn--lg" href={bookHref}>
              <span className="btn__label--idle">Réserver</span>
              <Icon name="arrow-right" size={18} className="ico--arrow" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <TabBar />
    </>
  );
}

/* --- Pieces --------------------------------------------------------------- */


/**
 * One service, and the way into booking it.
 *
 * <p>The photograph is the first one and only the first. A provider may
 * publish five per service and this page is read on a mid-range telephone over
 * 3G: a catalogue of twenty services would pull a hundred images to show a
 * price list. The badge says how many the booking page will show.
 */
function ServiceRow({
  service,
  bookHref,
}: {
  service: PublicServiceOffering;
  bookHref: string;
}) {
  const photos = service.photos ?? [];
  const photo = mediaUrl(photos[0]);
  const mode = MODES[service.fulfilment];

  return (
    <div className="svc">
      <div className="svc__photo">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" loading="lazy" width={400} height={300} />
        ) : (
          <span
            style={{
              display: "grid",
              placeItems: "center",
              height: "100%",
              color: "var(--p-warm-400)",
            }}
          >
            <Icon name="image" size={24} />
          </span>
        )}
        {photos.length > 1 ? (
          <span className="svc__photo-count">
            <Icon name="image" size={16} />
            {photos.length}
          </span>
        ) : null}
      </div>

      <div className="grow">
        <h3 className="svc__name">{service.name}</h3>
        {service.description ? (
          <p className="svc__desc">{service.description}</p>
        ) : null}
        <div className="svc__facts">
          <span className={`mode ${mode.className}`}>
            <Icon name={mode.icon} />
            {mode.label}
          </span>
          {service.turnaround_hours ? (
            <span className="fact fact--strong">
              <Icon name="hourglass" />
              Prêt sous {turnaround(service.turnaround_hours)}
            </span>
          ) : null}
          <span className="fact">
            <Icon name="clock" />
            {/* On a drop-off the minutes are the handover, not the work. Showing
                them bare would tell somebody a repair takes twenty minutes. */}
            {service.fulfilment === "DROP_OFF" ? "Remise " : null}
            {duration(service.duration_minutes)}
          </span>
        </div>
      </div>

      <div className="svc__cta">
        <div className="svc__price">
          {/* `price` is ABSENT when the provider set `price_visible` to false -
              the projection has no field at all, so there is no zero to mistake
              for free, and nothing is written in its place. */}
          {service.price ? <span className="t-price">{amount(service.price)}</span> : null}
        </div>
        <Link
          className="btn btn--primary"
          href={`${bookHref}?service=${encodeURIComponent(service.service_offering_id)}`}
        >
          <span className="btn__label--idle">Réserver</span>
          <Icon name="arrow-right" size={18} className="ico--arrow" />
        </Link>
      </div>
    </div>
  );
}

/** The day being lived, where the provider is. Absent when the zone is unreadable. */
function TodayBadge({
  week,
  today,
}: {
  week: { iso: number; segments: Segment[] }[];
  today: number;
}) {
  const day = week.find((d) => d.iso === today);
  if (!day) return null;

  const first = day.segments[0];
  const last = day.segments[day.segments.length - 1];
  if (!first || !last) {
    return (
      <span className="badge badge--neutral">
        <Icon name="clock" /> Fermé aujourd’hui
      </span>
    );
  }
  return (
    <span className="badge badge--success">
      <Icon name="clock" /> Ouvert aujourd’hui · {first.start_time}–{last.end_time}
    </span>
  );
}


/* --- Reading the data ----------------------------------------------------- */

/** The trade in French. Absent slug, or one the taxonomy withdrew, shows nothing. */
function tradeLabel(categories: CategoryList, slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return categories.data.find((c) => c.slug === slug)?.label_fr;
}

/**
 * Where the business is, finest first.
 *
 * <p>`city` is the field the contract deprecated and it stands in only for a
 * provider registered before the published map existed - otherwise the commune
 * would print twice, once as itself and once as the free-text it replaced.
 */
function placeOf(provider: PublicProvider): string {
  return [provider.area, provider.locality?.label_fr ?? provider.city]
    .filter(Boolean)
    .join(", ");
}

/**
 * The shapes this catalogue actually sells, in the fixed order.
 *
 * <p>Read from the services rather than declared on the provider, because the
 * contract holds it on the offering: a salon that also travels is two kinds of
 * service, not a second kind of salon.
 */
function modesOf(services: PublicServiceOffering[]): Fulfilment[] {
  const present = new Set(services.map((s) => s.fulfilment));
  return MODE_ORDER.filter((mode) => present.has(mode));
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

/* --- Writing the data ----------------------------------------------------- */

/** A published price, or the word for the one that costs nothing. */
function amount(price: Money): string {
  return price.amount_minor === 0 ? "Gratuit" : money(price);
}

/** Non-breaking spaces: "2 h 30" must never break across two lines. */
function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours} h`
    : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/**
 * A promised delay, in the unit a customer counts it in.
 *
 * <p>A day and a week only when the figure divides exactly. "Prêt sous 50 h"
 * is a number nobody converts standing in a shop, and "prêt sous 2 jours" for
 * fifty hours would be a promise the provider did not make.
 */
function turnaround(hours: number): string {
  if (hours >= 168 && hours % 168 === 0) {
    const weeks = hours / 168;
    return weeks === 1 ? "1 semaine" : `${weeks} semaines`;
  }
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} jours`;
  return `${hours} h`;
}

/**
 * The number as it is written on a card, not as it travels.
 *
 * <p>Grouped only for the one country whose shape this can read without
 * guessing - +224 and nine digits. Any other number is printed as the contract
 * sent it, because cutting it into threes and twos would be inventing a
 * convention that country does not use.
 */
function phone(e164: string): string {
  const parts = /^\+224(\d{3})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return parts ? `+224 ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]}` : e164;
}

/** The address the customer is standing on, as this server is reached from outside. */
function pageUrl(slug: string): string {
  return new URL(`/p/${slug}`, env.publicOrigin).toString();
}

/** The same address, written to be read aloud rather than clicked. */
function pageLabel(slug: string): string {
  const url = new URL(`/p/${slug}`, env.publicOrigin);
  return `${url.host}${url.pathname}`;
}

/**
 * A conversation, opened on the number the provider published.
 *
 * <p>wa.me takes the number in digits with no plus and no separator, and
 * answers "phone number shared via url is invalid" for anything else - which
 * is what an E.164 string pasted straight in produces.
 */
function whatsAppHref(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}
