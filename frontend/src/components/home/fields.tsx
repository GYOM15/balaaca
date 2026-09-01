import type { CSSProperties } from "react";
import { groupLocalities, localityLabel } from "@/lib/localities";
import type { AreaList, AreaView, LocalityList } from "@/lib/types";

/** The published map, grouped the way `groupLocalities` shapes it. */
export function LocalityOptions({ localities }: { localities: LocalityList }) {
  return (
    <>
      <option value="">Partout en Guinée</option>
      {groupLocalities(localities.data).map(({ region, children }) => (
        <optgroup key={region.slug} label={region.label_fr}>
          {children.map((l) => (
            <option key={l.slug} value={l.slug}>
              {localityLabel(l)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/**
 * A datalist and not a select: the quartier is free text on the server, because
 * Guinea's neighbourhoods run into the thousands and this platform does not
 * author them. What has already been written is offered without the rest being
 * refused, which is exactly what the server does.
 */
export function AreaOptions({ id, areas }: { id: string; areas: AreaList }) {
  return (
    <datalist id={id}>
      {areas.data.map((a: AreaView) => (
        <option key={a.label} value={a.label} />
      ))}
    </datalist>
  );
}

/** React's CSSProperties has no room for a custom property, and the mockup sets this one. */
export function stackGap(value: string): CSSProperties {
  return { "--stack-gap": value } as CSSProperties;
}
