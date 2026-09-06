import type { ProviderProfile } from "@/lib/types";

/**
 * The profile as the API takes it back.
 *
 * <p>Every field of the request, because the request replaces the resource and
 * one left out here is a column cleared on the next publication. The view
 * answers a locality object where the request takes its slug; everything else
 * is the same name on both sides.
 *
 * <p>Its own module rather than a helper inside `actions.ts`, and not for
 * tidiness: everything exported from a `"use server"` file becomes a server
 * action, so a pure function that lives there cannot be called from a test. It
 * needs to be, because "every field of the request" is a promise nobody was
 * keeping - `links` was added to the contract and this function did not gain
 * it, which meant publishing a page would have silently cleared every social
 * link on it. `profile-request.test.mts` is what now refuses that.
 */
export function asRequest(profile: ProviderProfile) {
  return {
    business_name: profile.business_name,
    description: profile.description,
    category_slug: profile.category_slug,
    locality_slug: profile.locality?.slug,
    area: profile.area,
    city: profile.city,
    address_line: profile.address_line,
    public_phone_e164: profile.public_phone_e164,
    public_email: profile.public_email,
    whatsapp_phone_e164: profile.whatsapp_phone_e164,
    links: profile.links,
    timezone: profile.timezone,
  };
}
