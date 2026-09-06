package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.domain.SocialLink;
import com.balaaca.providers.domain.SocialNetwork;
import com.balaaca.providers.ports.inbound.LookupPublicProviderUseCase;
import com.balaaca.providers.ports.inbound.ManageProviderProfileUseCase.LocalityRef;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

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
                       l.slug, l.label_fr, p.area, p.address_line, p.logo_url,
                       p.cover_url, p.public_phone_e164, p.whatsapp_phone_e164,
                       p.timezone
                  FROM providers p
                  LEFT JOIN provider_categories c ON c.id = p.category_id
                  LEFT JOIN localities l ON l.id = p.locality_id
                 WHERE p.id = app_current_provider()
                """).getSingleResult();

        return new PublicProvider(
                (String) r[0], (String) r[1],
                text(r[2]), text(r[3]), text(r[4]),
                locality(r[5], r[6]), text(r[7]), text(r[8]),
                text(r[9]), text(r[10]), text(r[11]), text(r[12]),
                links(),
                ZoneId.of((String) r[13]));
    }

    /**
     * The row of icons.
     *
     * <p>Its own statement rather than a join, because a provider has several
     * of these and joining would multiply the page row by them - and then the
     * one-row read above would have to collapse duplicates of every other
     * column back down.
     *
     * <p>{@code ORDER BY kind} is the same order the owner's own read uses, so
     * the preview a provider looks at cannot draw these differently from the
     * page a customer reads.
     */
    @SuppressWarnings("unchecked")
    private List<SocialLink> links() {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT kind, value
                  FROM provider_links
                 WHERE provider_id = app_current_provider()
                 ORDER BY kind
                """).getResultList();

        return rows.stream()
                .map(r -> new SocialLink(SocialNetwork.valueOf((String) r[0]), (String) r[1]))
                .toList();
    }

    private static Optional<String> text(Object column) {
        return Optional.ofNullable((String) column).filter(v -> !v.isBlank());
    }

    /**
     * Both halves or neither. The join is outer, so a provider filed nowhere
     * yields two nulls, and a slug with no label would draw an empty chip.
     */
    private static Optional<LocalityRef> locality(Object slug, Object label) {
        return text(slug).flatMap(s -> text(label).map(l -> new LocalityRef(s, l)));
    }
}
