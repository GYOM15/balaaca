package com.balaaca.providers.ports.inbound;

import com.balaaca.providers.domain.ProviderStatus;
import java.time.ZoneId;
import java.util.Optional;

/**
 * The page a provider publishes about itself, read and written.
 *
 * <p>No provider identifier: the tenant is ambient. Singular throughout,
 * because the caller has exactly one and there is no collection to select from.
 */
public interface ManageProviderProfileUseCase {

    ProviderProfile current();

    /**
     * What is still missing before this page can go on the public path.
     *
     * <p>The three conditions have existed since publishing had a gate, and
     * until now they were only ever spoken as a REFUSAL - a provider filled in
     * a form, pressed publish, and was told what they should have done first.
     * Registration then dropped them on that form with no idea any of it
     * existed.
     *
     * <p>Answered by the same predicates the gate itself uses, in one call.
     * Three separate reads from the edge would put the definition of "ready" in
     * two places, and the second one would drift the first time a condition
     * changed.
     */
    Readiness readiness();

    /**
     * The whole profile, for the same reason opening hours are replaced a week
     * at a time: a partial edit leaves the question of what happened to the
     * fields nobody mentioned.
     *
     * @throws com.balaaca.providers.domain.NothingToPublishException when the
     *         edit asks to publish a page with nothing bookable on it
     */
    ProviderProfile replace(ProfileEdit edit);

    /**
     * Two methods rather than one taking a kind, so no enum has to cross into
     * the edge to say which image this is. The bytes are validated and stripped
     * of their metadata before anything is stored.
     */
    /**
     * The rules the diary runs by, as opposed to the page a customer reads.
     *
     * <p>Its own pair of methods for the same reason it is its own resource:
     * five values that decide when a business can be booked have no business
     * riding on an edit to an address, where losing one is invisible until a
     * customer books too late.
     */
    BookingPolicy currentPolicy();

    /** @throws com.balaaca.platformkernel.tenancy.NotProviderOwnerException not the owner */
    BookingPolicy replacePolicy(BookingPolicy policy);

    ProviderProfile replaceLogo(byte[] image);

    ProviderProfile replaceCover(byte[] image);

    /**
     * @param slug the public handle. Read-only here: it is on the QR code and in
     *             every message already sent, and changing it breaks all of them
     * @param status the platform's standing, which the provider does not set
     */
    record ProviderProfile(String slug,
                           String businessName,
                           Optional<String> description,
                           Optional<String> categorySlug,
                           Optional<LocalityRef> locality,
                           Optional<String> area,
                           Optional<String> city,
                           Optional<String> addressLine,
                           Optional<String> publicPhoneE164,
                           Optional<String> publicEmail,
                           Optional<String> whatsappPhoneE164,
                           Optional<String> logoUrl,
                           Optional<String> coverUrl,
                           ZoneId timezone,
                           boolean published,
                           ProviderStatus status,
                           /**
                            * Why the platform took this page off the hub, in
                            * the operator's own words. Published to the
                            * PROVIDER on purpose: a business whose page has
                            * vanished must be able to read the reason on its
                            * own dashboard, rather than discovering it because
                            * customers stopped arriving.
                            */
                           Optional<java.time.Instant> suspendedAt,
                           Optional<String> suspensionReason) {
    }

    /**
     * @param hasService a service a customer can choose. Empty catalogue is the
     *                   one a salon is most likely to have forgotten
     * @param hasHours the week, without which the diary can offer nothing
     * @param hasBookableStaff somebody a customer can be given. A solo barber
     *                         has this from the moment they register - the
     *                         owner row is bookable - so it is the condition
     *                         that fails only after somebody stood everybody
     *                         down
     */
    record Readiness(boolean hasService, boolean hasHours, boolean hasBookableStaff,
                     boolean published) {

        /** What the gate will answer, computed the same way it computes it. */
        public boolean canPublish() {
            return hasService && hasHours && hasBookableStaff;
        }
    }

    /**
     * @param minLeadTime how much notice the provider needs. Zero means a
     *                    customer at the counter can take the next slot
     * @param cancellationDeadline how late a CUSTOMER may call off online. It
     *                             never binds the provider
     */
    record BookingPolicy(int slotGranularityMinutes,
                         int minLeadTimeMinutes,
                         int maxAdvanceDays,
                         int cancellationDeadlineMinutes,
                         boolean autoConfirm) {
    }

    /**
     * Where the business is, at the finest level the published map has.
     *
     * <p>Read side only. The write side takes a slug, because that is what a
     * client selected from {@code listLocalities} - and resolving it here is
     * what turns a label nobody can filter on into one that is.
     */
    record LocalityRef(String slug, String labelFr) {
    }

    /** Everything a provider may change about its own page, and nothing else. */
    record ProfileEdit(String businessName,
                       Optional<String> description,
                       Optional<String> categorySlug,
                       Optional<String> localitySlug,
                       Optional<String> area,
                       Optional<String> city,
                       Optional<String> addressLine,
                       Optional<String> publicPhoneE164,
                       Optional<String> publicEmail,
                       Optional<String> whatsappPhoneE164,
                       ZoneId timezone,
                       boolean published) {
    }
}
