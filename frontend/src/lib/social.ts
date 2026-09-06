import type { SocialNetwork } from "@/lib/types";

/**
 * The sprite id for a network, derived rather than looked up.
 *
 * <p>A table from network to icon name would be a second list beside the
 * contract's enum, and the day a network is added the table is what nobody
 * updates - with no error anywhere, because a `use` pointing at a symbol that
 * does not exist draws nothing and keeps its box.
 *
 * <p>Derived here, once, so `sprite-symbols.test.mts` can walk the enum as the
 * contract publishes it and assert that every value lands on a symbol the
 * sprite actually lays down.
 */
export function networkIcon(kind: SocialNetwork): string {
  return `net-${kind.toLowerCase()}`;
}

/**
 * The names as they are written, which is not always as they are spelt.
 *
 * <p>This one IS a table, and it has to be: "TikTok" and "LinkedIn" are not
 * derivable from `TIKTOK` and `LINKEDIN`. Typed on the enum, so a network the
 * contract adds and this map has not is a compile error rather than a blank
 * label.
 */
export const NETWORK_LABELS: Record<SocialNetwork, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  LINKEDIN: "LinkedIn",
  X: "X",
  WEBSITE: "Site web",
};

/**
 * What the form prints in front of the field, so a provider types a handle
 * rather than pasting an address the database would refuse.
 *
 * <p>The same bases the server composes with. Two copies, and this one is the
 * one that can be wrong without anything breaking - it is a label - so it is
 * checked: `social-bases.test.mts` reads the Java enum and asserts they agree.
 */
export const NETWORK_BASES: Record<SocialNetwork, string> = {
  FACEBOOK: "https://www.facebook.com/",
  INSTAGRAM: "https://www.instagram.com/",
  TIKTOK: "https://www.tiktok.com/",
  YOUTUBE: "https://www.youtube.com/",
  LINKEDIN: "https://www.linkedin.com/",
  X: "https://x.com/",
  WEBSITE: "",
};

/** The order the form draws them in, and the one the API answers in. */
export const NETWORKS: SocialNetwork[] = [
  "FACEBOOK", "INSTAGRAM", "LINKEDIN", "TIKTOK", "WEBSITE", "X", "YOUTUBE",
];

/**
 * What each field shows when it is empty, so the shape is obvious before the
 * first refusal rather than after it.
 */
export const NETWORK_PLACEHOLDERS: Record<SocialNetwork, string> = {
  FACEBOOK: "salon.fatou",
  INSTAGRAM: "salon.fatou",
  TIKTOK: "@salonfatou",
  YOUTUBE: "@salonfatou",
  LINKEDIN: "company/salon-fatou",
  X: "salonfatou",
  WEBSITE: "https://salon-fatou.gn",
};

/**
 * The contract's own pattern for a handle, so the browser refuses on the field
 * what the API would refuse on the request.
 *
 * <p>A copy, and copies are what this repository keeps paying for - so it is
 * checked: `social-handle-pattern.test.mts` reads `SocialHandle.value` out of
 * openapi.yaml and asserts this is character for character the same. It cannot
 * be read at run time: the contract is not in the deployed image, and this has
 * to reach a browser as an attribute.
 *
 * <p>Deliberately the COARSE gate and not the per-network rule. The exact rule
 * is a CHECK constraint per network and restating it here would be a third
 * definition; what this stops is the whole class the constraint exists for -
 * a scheme, whitespace, a query, a fragment.
 */
export const HANDLE_PATTERN =
  "^(@?[A-Za-z0-9][A-Za-z0-9._-]{0,63}(/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){0,3}"
  + "|https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(/[^\\s?#]*)?)$";
