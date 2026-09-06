import Link from "next/link";
import { Icon } from "@/components/icon";
import { Sketch, sketchForTrade } from "@/components/sketch";
import { Stars } from "@/components/stars";
import { mediaUrl, money } from "@/lib/format";
import type { Fulfilment, ProviderSummary } from "@/lib/types";

/**
 * The three shapes a service can take, worded exactly as the provider's own
 * page words them. A card that named a mode one way and the page it links to
 * named it another would be two names for one thing.
 *
 * <p>Fixed order rather than the order the set arrives in: the contract calls
 * `fulfilments` unordered, so ranking it here is what keeps two cards from
 * showing the same three badges in two different arrangements.
 */
const MODES: Record<Fulfilment, { className: string; icon: string; label: string }> = {
  ON_SITE: { className: "mode--on-site", icon: "mode-onsite", label: "Sur place" },
  DROP_OFF: { className: "mode--drop-off", icon: "mode-dropoff", label: "Dépôt" },
  AT_CUSTOMER: { className: "mode--at-customer", icon: "mode-atcustomer", label: "À domicile" },
};

const MODE_ORDER: Fulfilment[] = ["ON_SITE", "DROP_OFF", "AT_CUSTOMER"];

/**
 * A provider, as the directory shows them.
 *
 * <p>The band and the mark are two things, not one choice between two. The
 * cover photograph fills the band; the logo sits ON it, round and centred,
 * straddling its bottom edge. The band says where you are and the mark says who
 * it is, and neither has to be distorted to stand in for the other.
 *
 * <p>That is what was wrong before. `ProviderSummary` carried only a logo, so
 * the band drew a square mark - made to be read at the size of a favicon -
 * floating in a strip four times wider than tall. Choosing one of the two was
 * the wrong question.
 *
 * <p>With neither, the drawing that stands for the trade fills the band on the
 * warm ground the stylesheet gives it, which is what a business registered this
 * morning looks like.
 *
 * <p>The trade is shown by its label, resolved by the caller from
 * `GET /v1/categories`. The card carries the slug, and `dj-animation` is not
 * something to print at a customer.
 *
 * <p>The foot is back. It was dropped because `ProviderSummary` carried neither
 * the delivery modes nor a price, both being properties of a service; the
 * contract now derives both onto the summary, so the card can close the way the
 * design closes it. Both are still optional in three different ways - a
 * response written before the field existed, a business with no active service,
 * a business that publishes no price - and each of those means "nothing to
 * say", never "none". So an absent set draws no badges, an absent price draws
 * no "dès", and the two of them together draw no foot at all rather than a
 * bordered empty strip across every card.
 */
export function ProviderTile({
  provider,
  tradeLabel,
}: {
  provider: ProviderSummary;
  tradeLabel?: string;
}) {
  const cover = mediaUrl(provider.cover_url);
  const logo = mediaUrl(provider.logo_url);
  // `city` is the deprecated field the earliest rows carry, and nothing else.
  const place =
    [provider.area, provider.locality?.label_fr].filter(Boolean).join(", ") || provider.city;
  const modes = MODE_ORDER.filter((mode) => provider.fulfilments?.includes(mode));
  // Null and absent are the same answer here - no floor to quote - and zero is
  // not: a genuinely free service is a price the card must print.
  const from = provider.price_from ?? undefined;

  return (
    <Link className="pcard" href={`/p/${provider.slug}`}>
      <span className="pcard__cover" style={{ display: "grid", placeItems: "center" }}>
        {/* Plain img, not next/image: the bytes come through this server's own
            /media route and are already immutable and sized by the API. */}
        {cover ? (
          // The API stores a cover at 1600x400; this band is 16/9. So it IS
          // cropped, centrally, to a little under half its width - stated here
          // rather than glossed, because the alternative was worse either way:
          // a 4:1 strip across a 253 px card is 63 px of photograph, and
          // letterboxing it leaves more empty ground than picture. A centred
          // crop of a banner is what a directory card is.
          //
          // The intrinsic size is the FILE's and not the slot's. The wrong one
          // here is what taught the stylesheet to crop a square mark to fit a
          // lie, which is the defect this whole component exists to undo.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" width={1600} height={400} />
        ) : (
          <Sketch name={sketchForTrade(provider.category_slug)} width={160} />
        )}

        {/* On the band and not instead of it, straddling its bottom edge. The
            body's top padding is what leaves room for the half that hangs
            below. */}
        {logo ? (
          <span className="pcard__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" loading="lazy" width={128} height={128} />
          </span>
        ) : null}
      </span>
      <span className="pcard__body">
        {tradeLabel ? <span className="pcard__trade">{tradeLabel}</span> : null}
        <span className="pcard__name">{provider.business_name}</span>
        {place ? (
          <span className="t-meta">
            <span>
              <Icon name="pin" size={16} />
              {place}
            </span>
          </span>
        ) : null}
        {provider.description ? (
          <span className="t-sm t-clamp-2" style={{ marginTop: ".25rem" }}>
            {provider.description}
          </span>
        ) : null}
      </span>
      {modes.length > 0 || from || provider.rating ? (
        <span className="pcard__foot">
          {/* The stars lead the foot: it is the first thing somebody comparing
              two salons looks at, and absent is not nought out of five - a
              business nobody has reviewed simply has no line here. */}
          {provider.rating ? (
            <Stars rating={provider.rating} className="pcard__rating" />
          ) : null}
          {modes.length > 0 ? (
            <span className="pcard__modes">
              {modes.map((mode) => (
                <span key={mode} className={`mode ${MODES[mode].className}`}>
                  <Icon name={MODES[mode].icon} size={16} />
                  {MODES[mode].label}
                </span>
              ))}
            </span>
          ) : null}
          {/* A floor, and said as one. What this customer pays depends on the
              service they pick, so the figure is never printed as a price. */}
          {from ? <span className="pcard__from">dès {money(from)}</span> : null}
        </span>
      ) : null}
    </Link>
  );
}
