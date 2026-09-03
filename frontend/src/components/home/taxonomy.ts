import type { CategoryList } from "@/lib/types";

/**
 * The trade taxonomy, as the two menus on this route need it.
 *
 * <p>No alias for a single trade in lib/types.ts, and that file belongs to
 * nobody here, so the row type is named locally.
 */
export type Trade = CategoryList["data"][number];

/** One heading of the menu: a family and the trades filed under it. */
export type Family = {
  /** Null for the trades the contract files under no family at all. */
  slug: string | null;
  label_fr: string;
  trades: Trade[];
};

/**
 * The word the contract itself uses for a trade that belongs to no family:
 * "Absent on one that belongs to none, which lands in a 'Divers' bucket rather
 * than nowhere."
 */
const NO_FAMILY = "Divers";

/**
 * The taxonomy grouped, in the order the API published it.
 *
 * <p>Not sorted. `GET /v1/categories` returns the families and the trades
 * inside them in a curated order - Beauté before Savoir, Coiffure before
 * Onglerie - and alphabetising either would scatter a menu somebody arranged.
 */
export function byFamily(trades: Trade[]): Family[] {
  const order: Family[] = [];
  const index = new Map<string, Family>();
  for (const trade of trades) {
    const key = trade.family?.slug ?? "";
    let family = index.get(key);
    if (!family) {
      family = {
        slug: trade.family?.slug ?? null,
        label_fr: trade.family?.label_fr ?? NO_FAMILY,
        trades: [],
      };
      index.set(key, family);
      order.push(family);
    }
    family.trades.push(trade);
  }
  return order;
}
