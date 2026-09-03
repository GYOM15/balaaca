/** What the reader has asked the directory for, as this route reads it back. */
export type Asked = {
  q: string;
  selected: string[];
  locality: string;
  area: string;
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
  if (cursor) query.set("cursor", cursor);
  const search = query.toString();
  return search ? `/?${search}` : "/";
}
