package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.LookupNoticeProfileUseCase;
import com.balaaca.providers.ports.inbound.NoticeProfile;
import com.balaaca.providers.ports.inbound.NoticeProfile.NoticeDestination;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.ZoneId;
import java.util.Optional;

/**
 * Reads the current tenant's row explicitly.
 *
 * <p>{@code providers} carries two policies, OR'd: the tenant one and a
 * public-read one, so a bare SELECT with a tenant bound returns this provider
 * AND every published provider. Anything meaning "mine" names
 * {@code app_current_provider()}.
 *
 * <p>Transactional because the tenant reaches PostgreSQL as a SET LOCAL, which
 * is discarded outside a transaction (see ADR-0002).
 */
@ApplicationScoped
public class NoticeProfileSqlRepository implements LookupNoticeProfileUseCase {

    private final EntityManager em;

    public NoticeProfileSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public NoticeProfile currentNoticeProfile() {
        // WhatsApp first: it is the channel this market actually reads, and a
        // provider who filled it in chose it over the public line.
        Object[] r = (Object[]) em.createNativeQuery("""
                SELECT business_name, timezone, country_code,
                       coalesce(whatsapp_phone_e164, public_phone_e164), public_email
                  FROM providers WHERE id = app_current_provider()
                """).getSingleResult();

        Optional<String> phone = Optional.ofNullable((String) r[3]);
        Optional<String> email = Optional.ofNullable((String) r[4]);

        return new NoticeProfile(
                (String) r[0],
                ZoneId.of((String) r[1]),
                (String) r[2],
                phone.isEmpty() && email.isEmpty()
                        ? Optional.empty()
                        : Optional.of(new NoticeDestination(phone, email)));
    }
}
