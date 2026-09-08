/**
 * A business name, as the published pattern will accept it.
 *
 * <p>Applied while somebody types rather than on submit, so the field always
 * holds what the address will be. Otherwise the preview under it promises an
 * address with spaces in it, which `RegisterProviderRequest.slug` cannot accept,
 * and the person learns why only when the browser refuses the form with "match
 * the requested format".
 *
 * <p>Accents are stripped rather than refused. This is Guinea: "Aissatou" and
 * "Aïssatou" are the same name, and a handle is not the place to make somebody
 * choose. NFD splits a letter from its accent so the range below removes the
 * accent alone and keeps the letter.
 *
 * <p>Its own module, and not a helper inside the component, because a `.tsx`
 * cannot be imported by the test runner: `node --test
 * --experimental-strip-types` strips types and does not transform JSX. A rule
 * that is not testable is a rule that drifts.
 *
 * <p>What it does NOT do is guarantee a valid handle. A trailing hyphen
 * survives, deliberately: trimming it while typing makes "salon-" impossible to
 * type, because the hyphen would vanish the moment it was pressed. And nothing
 * here enforces the minimum length. Both are refused by the field's own
 * `pattern` and `minLength`, visibly, at the moment that is right to say so.
 */
export function normaliseSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60);
}
