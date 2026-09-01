/**
 * One glyph, drawn from the sprite the root layout laid down.
 *
 * <p>A `use` and not a path: the sprite is parsed once and every icon after it
 * is a reference. On the telephones this is built for that is the difference
 * between eighty inline SVGs and one.
 *
 * <p>Always `aria-hidden`. An icon in this product sits beside the word it
 * illustrates and never carries a name of its own - one that needed announcing
 * would be a missing label.
 */

/**
 * The stylesheet's four sizes, reachable by the pixel figure a caller has in
 * mind. Anything else lands on the base size rather than inventing a width -
 * a one-off dimension is how a set of icons stops being a set.
 */
const SIZES: Record<number, string> = {
  16: "ico--xs",
  18: "ico--sm",
  24: "ico--lg",
  32: "ico--xl",
};

/** Interface glyphs: `i-search`, `i-calendar`, `i-check`… */
export function Icon({
  name,
  size,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`ico ${size ? SIZES[size] ?? "" : ""} ${className}`.replace(/\s+/g, " ").trim()}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}

/**
 * A trade's own glyph.
 *
 * <p>Falls back to the storefront when a trade has none. Seventeen of the
 * thirty-five have no glyph yet - every trade V025 added, which is the whole of
 * mechanics, plumbing, cleaning and tuition - and a broken reference draws
 * nothing at all, which reads as a layout bug rather than as a missing
 * drawing.
 */
export function TradeIcon({
  slug,
  size,
  className = "",
}: {
  slug: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg className={`ico ${size ? SIZES[size] ?? "" : ""} ${className}`.replace(/\s+/g, " ").trim()} aria-hidden="true" focusable="false">
      <use href={`#t-${slug}`} />
    </svg>
  );
}

/**
 * A scene: the larger drawings that carry an empty state or sit behind a
 * section. `storefront`, `chair`, `braiding`, `mechanic`, `notebook`,
 * `photographer`, `tailor`, `tools`.
 *
 * <p>Its own component because a scene is not an icon: it lives on a 200x150
 * grid, and the stylesheet gives it a stroke that does not scale so the line
 * stays the same weight at 148 px and at 460.
 */
export function Scene({
  name,
  className = "",
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 200 150"
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#s-${name}`} />
    </svg>
  );
}
