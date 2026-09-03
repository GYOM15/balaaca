import Link from "next/link";
import { Icon } from "@/components/icon";
import { Sketch, sketchForTrade } from "@/components/sketch";
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
 * <p>The cover band is illustrated: the drawing that stands for the trade, on
 * the warm ground the stylesheet gives `.pcard__cover`. A business that
 * published a logo gets its logo there instead - that is its own picture of
 * itself, and it is the only image `ProviderSummary` carries.
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
      <span
        className={`pcard__cover${logo ? " pcard__cover--mark" : ""}`}
        style={{ display: "grid", placeItems: "center" }}
      >
        {logo ? (
          // Plain img, not next/image: the bytes come through this server's own
          // /media route and are already immutable and sized by the API.
          //
          // The intrinsic size said 640x360, which no logo is: it described the
          // 16/9 slot rather than the file, and the stylesheet then cropped a
          // square mark to fit that lie. Square is the honest guess for a logo,
          // and the --mark rules contain it either way.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" loading="lazy" width={640} height={640} />
        ) : (
          <Sketch name={sketchForTrade(provider.category_slug)} width={160} />
        )}
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
      {modes.length > 0 || from ? (
        <span className="pcard__foot">
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
