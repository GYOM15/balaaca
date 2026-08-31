import Link from "next/link";
import { mediaUrl } from "@/lib/format";
import type { ProviderSummary } from "@/lib/types";
import { Avatar } from "./ui";

/**
 * A provider, as the directory shows them.
 *
 * <p>With their logo. `ProviderSummary` has carried `logo_url` since the
 * directory existed, and the reference mockup drew a two-letter monogram for
 * every business because it believed the platform stored no files - so a hub
 * of braiders, nail artists, pastry cooks and photographers showed not one
 * photograph. The monogram is still here, as the fallback it was meant to be.
 *
 * <p>The trade is shown by its label, resolved by the caller from
 * `GET /v1/categories`. The card carries the slug, and `dj-animation` is not
 * something to print at a customer.
 */
export function ProviderCard({
  provider,
  tradeLabel,
}: {
  provider: ProviderSummary;
  tradeLabel?: string;
}) {
  const logo = mediaUrl(provider.logo_url);
  return (
    <Link className="prov" href={`/p/${provider.slug}`}>
      <span className="prov__head">
        {logo ? (
          // Plain img, not next/image: the bytes come through this server's own
          // /media route and are already immutable and sized by the API.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar avatar--photo" src={logo} alt="" width={48} height={48} />
        ) : (
          <Avatar name={provider.business_name} />
        )}
        <span className="grow stack" style={{ gap: 3 }}>
          <span className="prov__name">{provider.business_name}</span>
          <span className="prov__meta">
            {tradeLabel ? <span>{tradeLabel}</span> : null}
            {tradeLabel && provider.city ? (
              <span className="prov__dot" aria-hidden="true" />
            ) : null}
            {provider.city ? <span>{provider.city}</span> : null}
          </span>
        </span>
      </span>
      {provider.description ? (
        <span className="prov__excerpt">{provider.description}</span>
      ) : null}
    </Link>
  );
}
