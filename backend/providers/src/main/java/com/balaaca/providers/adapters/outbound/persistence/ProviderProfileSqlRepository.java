package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.domain.ProviderStatus;
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
                SELECT p.slug, p.business_name, p.description, c.slug, p.city,
                       p.address_line, p.public_phone_e164, p.public_email,
                       p.whatsapp_phone_e164, p.logo_url, p.cover_url,
                       p.timezone, p.published, p.status
                  FROM providers p
                  LEFT JOIN provider_categories c ON c.id = p.category_id
                 WHERE p.id = app_current_provider()
                """).getSingleResult();

        return new ProviderProfile(
                (String) r[0], (String) r[1],
                text(r[2]), text(r[3]), text(r[4]), text(r[5]),
                text(r[6]), text(r[7]), text(r[8]),
                text(r[9]), text(r[10]),
                ZoneId.of((String) r[11]),
                (Boolean) r[12],
                ProviderStatus.valueOf((String) r[13]));
    }

    @Override
    public ProviderProfile update(ProfileEdit edit, Optional<UUID> categoryId) {
        // public_email is citext, so it is cast rather than left for the driver
        // to send as varchar and PostgreSQL to refuse.
        em.createNativeQuery("""
                UPDATE providers
                   SET business_name       = CAST(:businessName AS varchar),
                       description         = CAST(:description AS text),
                       category_id         = CAST(:categoryId AS uuid),
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

    private static Optional<String> text(Object column) {
        return Optional.ofNullable((String) column).filter(v -> !v.isBlank());
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

}
