/** What the reader has asked the directory for, as this route reads it back. */
export type Asked = {
  q: string;
  selected: string[];
  locality: string;
  area: string;
  /** ON_SITE, AT_CUSTOMER, DROP_OFF - any of them, as the contract reads it. */
  fulfilment: string[];
  /** Minor units, as typed. Empty is no ceiling, and "0" is a real ceiling. */
  priceMax: string;
};

/**
 * One state of the directory, as a link.
 *
 * <p>Everything the reader asked for lives in the URL and nowhere else, so a
 * chip that drops a filter and a pager that asks for the next page are both
 * just this function with one field changed. Empty fields are left out - a
 * `category_slug=` in the address is a filter on nothing.
 */
export function directoryHref(asked: Asked, cursor?: string): string {
  const query = new URLSearchParams();
  if (asked.q) query.set("q", asked.q);
  for (const slug of asked.selected) query.append("category_slug", slug);
  if (asked.locality) query.set("locality", asked.locality);
  if (asked.area) query.set("area", asked.area);
  for (const mode of asked.fulfilment) query.append("fulfilment", mode);
  // Written whenever it is non-empty, INCLUDING "0". A ceiling of nothing is a
  // question somebody can ask, and a falsy check would silently drop it.
  if (asked.priceMax !== "") query.set("price_max", asked.priceMax);
  if (cursor) query.set("cursor", cursor);
  const search = query.toString();
  return search ? `/?${search}` : "/";
}
