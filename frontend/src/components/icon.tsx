import { TRADE_ICONS, UI_ICONS } from "./icon-paths";

/**
 * One icon, on the mockup's 24 grid.
 *
 * <p>The stroke width is computed rather than fixed, which is the detail that
 * makes the set look like one set: a 1.55 px line at 24 would read as a hairline
 * at 40 and as a slab at 14, so the width is scaled to keep the OPTICAL weight
 * constant. The formula is the mockup's, kept to the digit.
 *
 * <p>`aria-hidden` always. An icon here never carries meaning on its own - every
 * one of them sits beside a label, or inside a control that has an accessible
 * name of its own. An icon that needed announcing would be a missing label.
 */
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const body = UI_ICONS[name];
  if (!body) return null;
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/**
 * The icon of a trade, by the slug the API publishes.
 *
 * <p>Returns the `layout` icon for a slug it does not know, rather than
 * nothing: the taxonomy is served by `GET /v1/categories` and is meant to grow,
 * so a trade added by a migration must render a tile the same day - a hole in
 * the grid would be a worse answer than a generic mark.
 */
export function TradeIcon({ slug, size = 22 }: { slug: string; size?: number }) {
  const body = TRADE_ICONS[slug] ?? UI_ICONS.layout;
  if (!body) return null;
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/** ~1.55 px of rendered line whatever the size, clamped so it stays a line. */
function strokeFor(size: number): number {
  return Number(Math.min(2.4, Math.max(1.1, (1.55 * 24) / size)).toFixed(2));
}
