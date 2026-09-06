import { Icon } from "@/components/icon";
import type { ReviewSummary } from "@/lib/types";

/** French takes a comma, and 4.5 read as "quatre point cinq" is not French. */
function decimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

/**
 * Five glyphs, filled to the nearest whole one.
 *
 * <p>The empty stars stay drawn. Without them, three out of five and three out
 * of three look alike and the reader has to count instead of seeing.
 *
 * <p>Rounded to a WHOLE star for the drawing, while a printed figure keeps its
 * decimal. Half glyphs were the other option and they are a lie at this size:
 * a 12-pixel star cut down the middle reads as a rendering fault on the
 * telephones this is built for.
 *
 * <p>`aria-hidden` on every glyph, like every icon in this product, with one
 * sentence on the group. Five stars announced one at a time is a screen reader
 * saying "star, star, star" at somebody who asked what a salon is worth.
 */
function Glyphs({ value, size, label }: { value: number; size: number; label: string }) {
  const filled = Math.round(value);
  return (
    <span className="stars__glyphs" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((position) => (
        // A different SYMBOL and not a different rule. `fill="none"` on the
        // outline star is a presentation attribute cloned into the `use` shadow
        // tree, and it beats anything the outer svg can inherit down - so no
        // class on this element could ever have filled it. Five outlines with
        // only a colour between them is what that looked like.
        <Icon
          key={position}
          name={position <= filled ? "star-filled" : "star"}
          size={size}
          className={position <= filled ? "star star--on" : "star"}
        />
      ))}
    </span>
  );
}

/**
 * A business's rating: the shapes AND the number.
 *
 * <p>The count is not optional and the contract makes it impossible to have one
 * without it. Five shapes are a picture of an average, and a picture cannot say
 * whether it is an average of three opinions or three hundred - which is the
 * whole difference between the two claims.
 */
export function Stars({
  rating,
  size = 16,
  className = "",
}: {
  rating: ReviewSummary;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`stars ${className}`.trim()}>
      <Glyphs
        value={rating.average}
        size={size}
        label={`${decimal(rating.average)} sur 5, ${rating.count} avis`}
      />
      {/* Repeated in text and hidden from the reader, which heard it in the
          label above: the number beside the shapes is what a sighted reader
          actually compares two salons on. */}
      <span className="stars__figure" aria-hidden="true">
        {decimal(rating.average)}
        <span className="stars__count">({rating.count})</span>
      </span>
    </span>
  );
}

/**
 * One review's own rating: the shapes and nothing else.
 *
 * <p>No count, because a single review is not an average of anything - "5,0
 * (1)" over one person's sentence is a statistic where there is only an
 * opinion.
 */
export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="stars">
      <Glyphs value={value} size={size} label={`${value} sur 5`} />
    </span>
  );
}
