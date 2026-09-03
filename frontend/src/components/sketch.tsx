import { Scene } from "./icon";

/**
 * A scene, at one of three ranks.
 *
 * <p>The level is not a size, it is a rank: 3 is the one large drawing a screen
 * is allowed, 2 is a section, 1 is an empty state. It survives as a prop
 * because a call site says what a drawing IS for, and that outlives whichever
 * set of drawings is installed.
 *
 * <p>The drawings themselves now live in the sprite, where the stroke is
 * declared once and told not to scale - so the line holds its weight at 96 px
 * and at 340, and the set stays a set. Before that they were eight
 * hand-carried path lists whose stroke was chosen here, per call, and they came
 * out 2.6 times heavier than drawn.
 */
export function Sketch({
  name,
  level = 2,
  width,
  className,
}: {
  name: string;
  level?: 1 | 2 | 3;
  width?: number;
  className?: string;
}) {
  const w = width ?? (level === 3 ? 240 : level === 2 ? 160 : 96);
  return (
    <Scene
      name={name}
      className={className ? `scene-ill ${className}` : "scene-ill"}
      style={{ width: w, maxWidth: "100%" }}
    />
  );
}

/**
 * The drawing that stands for a trade.
 *
 * <p>Eight drawings for thirty-five trades, so most of them land on the
 * storefront - which is the honest answer. A mechanic drawn for a tailor is
 * worse than a shop drawn for both.
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
    case "mecanique":
    case "plomberie":
    case "electricite":
      return "tools";
    default:
      return "storefront";
  }
}
