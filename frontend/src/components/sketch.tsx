import { SKETCHES } from "./sketch-paths";

/**
 * A sketch, at one of three weights.
 *
 * <p>The level is not a size, it is a rank: 3 is the one hero drawing a screen
 * is allowed, 2 is a section, 1 is an empty state. The stroke thickens with the
 * rank so a drawing keeps its presence when it grows, which is the mockup's
 * rule and the reason the set looks drawn rather than scaled.
 */
export function Sketch({
  name,
  level = 2,
  width,
  label,
  className,
}: {
  name: string;
  level?: 1 | 2 | 3;
  width?: number;
  /** Give one only when the drawing carries meaning no nearby text does. */
  label?: string;
  className?: string;
}) {
  const def = SKETCHES[name];
  if (!def) return null;

  const w = width ?? (level === 3 ? 240 : level === 2 ? 160 : 96);
  const box = def.viewBox.split(" ").map(Number);
  const height = Math.round((w * (box[3] ?? 200)) / (box[2] ?? 200));

  return (
    <svg
      className={className ? `sketch ${className}` : "sketch"}
      width={w}
      height={height}
      viewBox={def.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={level === 3 ? 1.9 : level === 2 ? 1.7 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : "presentation"}
      aria-hidden={label ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{
        __html: (label ? `<title>${escapeXml(label)}</title>` : "") + def.body,
      }}
    />
  );
}

/**
 * The drawing that belongs to a trade.
 *
 * <p>Four of the eight sketches depict a trade; the rest are situations. A
 * trade with no drawing of its own falls back to the storefront, which says
 * "a business" and says it for any of the eighteen - unlike `braiding`, which
 * the mockup used for all of them and which says "hairdresser" to a caterer.
 */
export function sketchForTrade(slug: string | undefined): string {
  switch (slug) {
    case "coiffure":
    case "barbier":
    case "tresses":
    case "esthetique":
    case "onglerie":
    case "maquillage":
      return "braiding";
    case "couture":
      return "tailor";
    case "photographie":
    case "video":
      return "photographer";
    default:
      return "storefront";
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
