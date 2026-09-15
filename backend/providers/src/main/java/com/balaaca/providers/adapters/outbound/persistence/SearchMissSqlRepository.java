package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.outbound.SearchMissRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

/** One upsert, in its own transaction, and never in the way of an answer. */
@ApplicationScoped
public class SearchMissSqlRepository implements SearchMissRepository {

    private static final Logger LOG = Logger.getLogger(SearchMissSqlRepository.class);

    /** The column's own limit. Longer is truncated rather than refused. */
    private static final int MAX = 120;

    private final EntityManager em;

    public SearchMissSqlRepository(EntityManager em) {
        this.em = em;
    }

    /**
     * REQUIRES_NEW, and its own failure handling.
     *
     * <p>This is a write on a read path, and the read is a customer searching a
     * public directory. Joining their transaction would mean a full table, a
     * lock, or a constraint nobody anticipated turning a search that worked
     * into a 500 - trading the thing the platform is for against a statistic.
     * So it commits alone and, if it cannot, says so in the log and lets the
     * search answer.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void record(String term) {
        String typed = term.length() > MAX ? term.substring(0, MAX) : term;
        try {
            // ON CONFLICT rather than a read and a branch: two customers
            // searching the same unknown word at the same moment are two
            // inserts racing for one key, and the loser must count rather
            // than fail.
            em.createNativeQuery("""
                    INSERT INTO search_misses (term_folded, term_as_typed)
                    VALUES (app_fold(CAST(:term AS varchar)), CAST(:term AS varchar))
                    ON CONFLICT (term_folded) DO UPDATE
                       SET times = search_misses.times + 1,
                           last_at = now()
                    """)
                    .setParameter("term", typed)
                    .executeUpdate();
        } catch (RuntimeException e) {
            LOG.warn("search.miss_not_recorded", e);
        }
    }
}
