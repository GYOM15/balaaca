import type { LocalityView } from "./types";

/**
 * The published map, grouped the way it is shaped.
 *
 * <p>Fifty-one flat rows read badly in a menu and navigate well in one: the
 * prefectures under their region, and the ten communes of Conakry under it. An
 * `optgroup` does that with no JavaScript, which is the constraint every screen
 * here works under.
 *
 * <p>Conakry is itself a prefecture holding communes, so the walk goes one
 * level deeper than the region's own children - otherwise Ratoma would not be
 * selectable, which is the single most common place a business is.
 *
 * <p>Here rather than in a page because three screens needed it and each had
 * written its own: the directory, the profile and the booking form. Three
 * copies of a tree walk is three places for the Conakry special case to be
 * forgotten.
 */
export function groupLocalities(all: LocalityView[]) {
  const byParent = new Map<string, LocalityView[]>();
  for (const l of all) {
    if (!l.parent_slug) continue;
    const siblings = byParent.get(l.parent_slug) ?? [];
    siblings.push(l);
    byParent.set(l.parent_slug, siblings);
  }
  return all
    .filter((l) => l.kind === "REGION")
    .map((region) => ({
      region,
      children: (byParent.get(region.slug) ?? []).flatMap((child) => [
        child,
        ...(byParent.get(child.slug) ?? []),
      ]),
    }));
}

/**
 * How a commune is set apart from a prefecture in a flat option list.
 *
 * <p>Two non-breaking spaces. Crude, and the only indent a `<select>` honours -
 * padding on an `<option>` is ignored by every browser that matters.
 */
export function localityLabel(l: LocalityView): string {
  return l.kind === "COMMUNE" ? `  ${l.label_fr}` : l.label_fr;
}
