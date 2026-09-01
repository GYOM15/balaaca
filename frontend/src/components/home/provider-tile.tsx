import Link from "next/link";
import { Icon } from "@/components/icon";
import { mediaUrl } from "@/lib/format";
import type { ProviderSummary } from "@/lib/types";

/**
 * A provider, as the directory shows them.
 *
 * <p>The cover band carries the logo, because that is the only image
 * `ProviderSummary` publishes - there is no `cover_url` on it, only on the
 * provider's own page. An empty band is what a business without a logo gets,
 * and it keeps every card the same shape.
 *
 * <p>The trade is shown by its label, resolved by the caller from
 * `GET /v1/categories`. The card carries the slug, and `dj-animation` is not
 * something to print at a customer.
 *
 * <p>No `.pcard__foot`. The mockup closes the card with the delivery modes and
 * a starting price, and `ProviderSummary` carries neither: both are properties
 * of a service, and the directory does not read services. A bar with nothing in
 * it is a border across every card, so the whole foot goes rather than half of
 * it.
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
  return (
    <Link className="pcard" href={`/p/${provider.slug}`}>
      <span className="pcard__cover">
        {logo ? (
          // Plain img, not next/image: the bytes come through this server's own
          // /media route and are already immutable and sized by the API.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" loading="lazy" width={640} height={360} />
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
    </Link>
  );
}
