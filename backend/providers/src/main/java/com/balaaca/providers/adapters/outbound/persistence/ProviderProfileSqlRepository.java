package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.domain.ProviderStatus;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProfileEdit;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.ProviderProfile;
import com.balaaca.providers.ports.outbound.ProviderProfileRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.time.ZoneId;
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
                       p.whatsapp_phone_e164, p.timezone, p.published, p.status
                  FROM providers p
                  LEFT JOIN provider_categories c ON c.id = p.category_id
                 WHERE p.id = app_current_provider()
                """).getSingleResult();

        return new ProviderProfile(
                (String) r[0], (String) r[1],
                text(r[2]), text(r[3]), text(r[4]), text(r[5]),
                text(r[6]), text(r[7]), text(r[8]),
                ZoneId.of((String) r[9]),
                (Boolean) r[10],
                ProviderStatus.valueOf((String) r[11]));
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
}
