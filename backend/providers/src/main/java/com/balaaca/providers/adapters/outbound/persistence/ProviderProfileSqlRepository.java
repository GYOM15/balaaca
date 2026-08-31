package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.domain.ProviderStatus;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.BookingPolicy;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.LocalityRef;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProfileEdit;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProviderProfile;
import com.balaaca.providers.ports.outbound.ProviderProfileRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The tenant's own row, read and written.
 *
 * <p>Both statements name {@code app_current_provider()} explicitly. A bare
 * predicate would be wrong in two different ways here: {@code providers} carries
 * a public-read policy alongside the tenant one and the two are OR'd, so a plain
 * SELECT returns this provider AND every published provider - and an UPDATE with
 * no predicate would be confined by the tenant policy but read as though it were
 * not, which is the kind of line that survives until someone loosens a policy.
 *
 * <p>The slug is absent from the UPDATE, and that is the enforcement rather than
 * a convention: it is the string on the QR code and in every message already
 * sent, and there is no path through this class that changes it.
 */
@ApplicationScoped
public class ProviderProfileSqlRepository implements ProviderProfileRepository {

    private final EntityManager em;

    public ProviderProfileSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    public ProviderProfile current() {
        Object[] r = (Object[]) em.createNativeQuery("""
                SELECT p.slug, p.business_name, p.description, c.slug,
                       l.slug, l.label_fr, p.area, p.city,
                       p.address_line, p.public_phone_e164, p.public_email,
                       p.whatsapp_phone_e164, p.logo_url, p.cover_url,
                       p.timezone, p.published, p.status,
                       p.suspended_at, p.suspension_reason
                  FROM providers p
                  LEFT JOIN provider_categories c ON c.id = p.category_id
                  LEFT JOIN localities l ON l.id = p.locality_id
                 WHERE p.id = app_current_provider()
                """).getSingleResult();

        return new ProviderProfile(
                (String) r[0], (String) r[1],
                text(r[2]), text(r[3]),
                locality(r[4], r[5]), text(r[6]), text(r[7]), text(r[8]),
                text(r[9]), text(r[10]), text(r[11]),
                text(r[12]), text(r[13]),
                ZoneId.of((String) r[14]),
                (Boolean) r[15],
                ProviderStatus.valueOf((String) r[16]),
                Optional.ofNullable(r[17]).map(ProviderProfileSqlRepository::instant),
                text(r[18]));
    }

    @Override
    public ProviderProfile update(ProfileEdit edit, Optional<UUID> categoryId,
                                  Optional<String> localitySlug) {
        // public_email is citext, so it is cast rather than left for the driver
        // to send as varchar and PostgreSQL to refuse.
        em.createNativeQuery("""
                UPDATE providers
                   SET business_name       = CAST(:businessName AS varchar),
                       description         = CAST(:description AS text),
                       category_id         = CAST(:categoryId AS uuid),
                       locality_id         = (SELECT id FROM localities
                                               WHERE slug = CAST(:locality AS varchar)),
                       area                = CAST(:area AS varchar),
                       city                = CAST(:city AS varchar),
                       address_line        = CAST(:addressLine AS varchar),
                       public_phone_e164   = CAST(:publicPhone AS varchar),
                       public_email        = CAST(:publicEmail AS citext),
                       whatsapp_phone_e164 = CAST(:whatsappPhone AS varchar),
                       timezone            = CAST(:timezone AS varchar),
                       published           = :published,
                       updated_at          = now()
                 WHERE id = app_current_provider()
                """)
                .setParameter("businessName", edit.businessName())
                .setParameter("description", edit.description().orElse(null))
                .setParameter("categoryId", categoryId.orElse(null))
                .setParameter("locality", localitySlug.orElse(null))
                .setParameter("area", edit.area().orElse(null))
                .setParameter("city", edit.city().orElse(null))
                .setParameter("addressLine", edit.addressLine().orElse(null))
                .setParameter("publicPhone", edit.publicPhoneE164().orElse(null))
                .setParameter("publicEmail", edit.publicEmail().orElse(null))
                .setParameter("whatsappPhone", edit.whatsappPhoneE164().orElse(null))
                .setParameter("timezone", edit.timezone().getId())
                .setParameter("published", edit.published())
                .executeUpdate();

        // Read back rather than reconstruct: status and slug are not the
        // caller's to set, and returning what was sent would state them wrong
        // the first time either changes anywhere else.
        return current();
    }

    private static java.time.Instant instant(Object value) {
        if (value instanceof java.time.OffsetDateTime o) {
            return o.toInstant();
        }
        if (value instanceof java.time.Instant i) {
            return i;
        }
        return ((java.sql.Timestamp) value).toInstant();
    }

    private static Optional<String> text(Object column) {
        return Optional.ofNullable((String) column).filter(v -> !v.isBlank());
    }

    /**
     * Both halves or neither. The join is outer, so a provider filed nowhere
     * yields two nulls - and a slug with no label would draw an empty chip on
     * every page that shows one.
     */
    private static Optional<LocalityRef> locality(Object slug, Object label) {
        return text(slug).flatMap(s -> text(label).map(l -> new LocalityRef(s, l)));
    }
    @Override
    public Optional<String> replaceLogo(String name) {
        return swapImage("logo_url", name);
    }

    @Override
    public Optional<String> replaceCover(String name) {
        return swapImage("cover_url", name);
    }

    /**
     * One statement, returning what it replaced. A read-then-write would leave a
     * window in which two uploads each believe they replaced the other's file,
     * and one image would be orphaned on disk with nothing pointing at it.
     *
     * <p>The column name is not a parameter a caller supplies - it comes from
     * the two methods above and nowhere else - so the concatenation names one of
     * exactly two literals.
     */
    @SuppressWarnings("unchecked")
    private Optional<String> swapImage(String column, String name) {
        // `FROM providers AS old` is the idiom for returning what an UPDATE
        // replaced. A subquery inside RETURNING would read the same statement's
        // snapshot and its value would depend on how PostgreSQL happened to
        // order the two, which is not something to build a file deletion on.
        List<String> previous = em.createNativeQuery(
                        "UPDATE providers SET " + column + " = :name, updated_at = now()"
                        + " FROM providers AS old"
                        + " WHERE providers.id = old.id"
                        + "   AND providers.id = app_current_provider()"
                        + " RETURNING old." + column)
                .setParameter("name", name)
                .getResultList();

        // Not findFirst(): the column is nullable, a provider that had no image
        // yields a list holding one null, and Optional.of on it throws. The
        // ordinary case - the first upload - was the one that broke.
        return previous.isEmpty()
                ? Optional.empty()
                : Optional.ofNullable(previous.get(0)).filter(v -> !v.isBlank());
    }

    @Override
    public BookingPolicy currentPolicy() {
        Object[] r = (Object[]) em.createNativeQuery("""
                SELECT slot_granularity_minutes, min_lead_time_minutes, max_advance_days,
                       cancellation_deadline_minutes, auto_confirm
                  FROM providers WHERE id = app_current_provider()
                """).getSingleResult();

        return new BookingPolicy(((Number) r[0]).intValue(), ((Number) r[1]).intValue(),
                                 ((Number) r[2]).intValue(), ((Number) r[3]).intValue(),
                                 (Boolean) r[4]);
    }

    @Override
    public BookingPolicy updatePolicy(BookingPolicy policy) {
        // The CHECK constraints on these five columns are the guarantee; the
        // contract's own bounds are the message. A value that gets past the
        // schema and fails here would surface as a 500, which is why the two
        // agree rather than one trusting the other.
        em.createNativeQuery("""
                UPDATE providers
                   SET slot_granularity_minutes      = :granularity,
                       min_lead_time_minutes         = :leadTime,
                       max_advance_days              = :horizon,
                       cancellation_deadline_minutes = :cancellation,
                       auto_confirm                  = :autoConfirm,
                       updated_at                    = now()
                 WHERE id = app_current_provider()
                """)
                .setParameter("granularity", policy.slotGranularityMinutes())
                .setParameter("leadTime", policy.minLeadTimeMinutes())
                .setParameter("horizon", policy.maxAdvanceDays())
                .setParameter("cancellation", policy.cancellationDeadlineMinutes())
                .setParameter("autoConfirm", policy.autoConfirm())
                .executeUpdate();

        return currentPolicy();
    }

}
