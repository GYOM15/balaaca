package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.LookupPublicProviderUseCase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import java.time.ZoneId;
import java.util.Optional;
import java.util.OptionalDouble;

/**
 * A provider's public page, in SQL.
 *
 * <p>The columns are chosen once, here, and the ones a customer must not see are
 * not among them: no status, no published flag, no booking policy, no
 * subscription. That is the difference between a projection and a filter - there
 * is no line to forget.
 *
 * <p>The tenant is bound from a published slug before this runs, so
 * {@code app_current_provider()} is the provider the customer asked for and an
 * unpublished one never got this far.
 */
@ApplicationScoped
public class PublicProviderSqlRepository implements LookupPublicProviderUseCase {

    private final EntityManager em;

    public PublicProviderSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public PublicProvider publicPage() {
        Object[] r = (Object[]) em.createNativeQuery("""
                SELECT p.slug, p.business_name, p.description, c.slug, p.city,
                       p.address_line, p.latitude, p.longitude, p.logo_url,
                       p.cover_url, p.public_phone_e164, p.whatsapp_phone_e164,
                       p.timezone
                  FROM providers p
                  LEFT JOIN provider_categories c ON c.id = p.category_id
                 WHERE p.id = app_current_provider()
                """).getSingleResult();

        return new PublicProvider(
                (String) r[0], (String) r[1],
                text(r[2]), text(r[3]), text(r[4]), text(r[5]),
                coordinate(r[6]), coordinate(r[7]),
                text(r[8]), text(r[9]), text(r[10]), text(r[11]),
                ZoneId.of((String) r[12]));
    }

    private static Optional<String> text(Object column) {
        return Optional.ofNullable((String) column).filter(v -> !v.isBlank());
    }

    private static OptionalDouble coordinate(Object column) {
        return column == null
                ? OptionalDouble.empty()
                : OptionalDouble.of(((BigDecimal) column).doubleValue());
    }
}
