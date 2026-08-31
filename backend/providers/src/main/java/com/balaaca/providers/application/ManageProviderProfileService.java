package com.balaaca.providers.application;

import com.balaaca.catalog.ports.inbound.PublishedCatalogueUseCase;
import com.balaaca.providers.domain.NothingToPublishException;
import com.balaaca.providers.domain.UnknownCategoryException;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase;
import com.balaaca.providers.ports.outbound.ImageStore;
import com.balaaca.providers.ports.outbound.ProviderProfileRepository;
import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditOutcome;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.providers.ports.outbound.ProviderRegistrationRepository;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The provider's own page, read and written.
 *
 * <p>Publishing is the one part of this that is a rule rather than a store. A
 * page goes on the public booking path only when there is something to book:
 * a customer who finds an empty calendar does not come back, and the provider
 * who published it has no way to know that happened.
 *
 * <p>The two readiness questions are asked of the modules that own the answers,
 * through their inbound ports and in this same transaction. Reading
 * {@code service_offerings} from here would put the definition of "an active
 * service" in two places, and the second one would drift.
 */
@ApplicationScoped
public class ManageProviderProfileService implements ManageProviderProfileUseCase {

    private final ProviderProfileRepository profiles;
    private final ProviderRegistrationRepository categories;
    private final PublishedCatalogueUseCase catalogue;
    private final ManageAvailabilityUseCase availability;
    private final TenantContext tenant;
    private final AuditTrail audit;
    private final ImageStore images;

    public ManageProviderProfileService(ProviderProfileRepository profiles,
                                        ProviderRegistrationRepository categories,
                                        PublishedCatalogueUseCase catalogue,
                                        ManageAvailabilityUseCase availability,
                                        TenantContext tenant,
                                        AuditTrail audit,
                                        ImageStore images) {
        this.profiles = profiles;
        this.categories = categories;
        this.catalogue = catalogue;
        this.availability = availability;
        this.tenant = tenant;
        this.audit = audit;
        this.images = images;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ProviderProfile current() {
        return profiles.current();
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ProviderProfile replace(ProfileEdit edit) {
        // The public page, the contact details and whether the business is
        // reachable at all. An employee editing their own hours is ordinary;
        // an employee unpublishing the storefront is not.
        tenant.requireOwner("update_provider_profile");
        if (edit.published()) {
            requireSomethingBookable();
        }
        Optional<UUID> categoryId = edit.categorySlug().map(this::requireCategory);
        ProviderProfile updated = profiles.update(edit, categoryId);

        // Whether the page is live is the one field worth reading back off the
        // trail months later: it is the difference between a business that took
        // no bookings and one that was never reachable.
        audit.record(new AuditEvent("PROVIDER_PROFILE_UPDATED", "provider",
                Optional.of(updated.slug()), AuditOutcome.SUCCESS,
                Map.of("published", String.valueOf(updated.published()))));

        return updated;
    }

    /**
     * Checked on the way in rather than after the write, so a refusal leaves the
     * page exactly as the provider left it. Services first: it is the one a
     * salon is more likely to have forgotten, and naming only the first missing
     * piece is what lets a provider fix one thing and try again.
     */
    private void requireSomethingBookable() {
        if (catalogue.published().isEmpty()) {
            throw new NothingToPublishException("no active service");
        }
        if (availability.combinedOpeningHours().isEmpty()) {
            throw new NothingToPublishException("no opening hours");
        }
    }

    private UUID requireCategory(String slug) {
        return categories.activeCategoryId(slug)
                .orElseThrow(() -> new UnknownCategoryException(slug));
    }
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ProviderProfile replaceLogo(byte[] image) {
        return replaceImage(image, "replace_logo", profiles::replaceLogo);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ProviderProfile replaceCover(byte[] image) {
        return replaceImage(image, "replace_cover", profiles::replaceCover);
    }

    /**
     * Validate, store, swap, then drop what was there.
     *
     * <p>That order matters. The file is written before the row points at it, so
     * a failure leaves an orphan on disk rather than a page pointing at nothing;
     * and the previous file is dropped only after the swap has committed to
     * naming its replacement, so a rollback never deletes the image the row
     * still uses. Wasted bytes are cheap and a broken page is not.
     */
    private ProviderProfile replaceImage(byte[] raw, String action,
                                         java.util.function.Function<String,
                                                 Optional<String>> swap) {
        tenant.requireOwner(action);

        String name = images.store(raw);
        Optional<String> previous = swap.apply(name);

        audit.record(new AuditEvent(action.toUpperCase(java.util.Locale.ROOT), "provider",
                Optional.of(name), AuditOutcome.SUCCESS,
                Map.of("content_type", images.contentTypeOf(name).orElse("unknown"))));

        previous.filter(old -> !old.equals(name)).ifPresent(images::discard);
        return profiles.current();
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public BookingPolicy currentPolicy() {
        return profiles.currentPolicy();
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public BookingPolicy replacePolicy(BookingPolicy policy) {
        // Owner-only, like the public page: these five decide when the business
        // can be booked at all, and an employee changing the notice period
        // changes what every colleague's day looks like.
        tenant.requireOwner("replace_booking_policy");

        BookingPolicy updated = profiles.updatePolicy(policy);
        audit.record(new AuditEvent("BOOKING_POLICY_UPDATED", "provider",
                Optional.empty(), AuditOutcome.SUCCESS,
                Map.of("auto_confirm", String.valueOf(updated.autoConfirm()),
                       "min_lead_time_minutes", String.valueOf(updated.minLeadTimeMinutes()))));
        return updated;
    }

}
