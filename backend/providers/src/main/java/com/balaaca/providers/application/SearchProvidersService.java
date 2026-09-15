package com.balaaca.providers.application;

import com.balaaca.providers.ports.inbound.SearchProvidersUseCase;
import com.balaaca.providers.ports.outbound.ProviderDirectoryRepository;
import com.balaaca.providers.ports.outbound.SearchMissRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/**
 * The hub's own search, and what it does when it answers nothing.
 *
 * <p>It exists because the SQL class implemented this use case directly, so
 * there was no layer to hold a decision about a RESULT rather than a way of
 * fetching one - the same gap `ModerateReviewsService` was created to close.
 *
 * <p>A word that returns nothing is worth more than the search that failed.
 * Somebody who types "coiffeur" and is shown an empty page knows a word this
 * taxonomy does not, and the synonym list nobody has cannot be invented in an
 * office: every directory of any size builds it by harvesting the failures.
 * The same rows answer a second question, and possibly the better one - which
 * trades people come here for and this platform has not recruited.
 */
@ApplicationScoped
public class SearchProvidersService implements SearchProvidersUseCase {

    /**
     * Below this, a term says nothing about what somebody meant. The API
     * already refuses a single character, and two is a coin toss - "dj" is a
     * trade and "le" is not, and a table of prepositions is a table nobody
     * reads.
     */
    private static final int WORTH_RECORDING = 3;

    private final ProviderDirectoryRepository directory;
    private final SearchMissRepository misses;

    public SearchProvidersService(ProviderDirectoryRepository directory,
                                  SearchMissRepository misses) {
        this.directory = directory;
        this.misses = misses;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Directory search(Query query) {
        Directory found = directory.search(query);

        // Only a WORD that found nothing. A search narrowed to a commune with
        // no businesses in it is an empty directory rather than a vocabulary
        // this platform is missing, and filing it would bury the words that
        // are - which is the one thing these rows exist to make findable.
        if (found.total() == 0 && onlyAWord(query)) {
            query.nameContains()
                    .map(String::trim)
                    .filter(term -> term.length() >= WORTH_RECORDING)
                    .ifPresent(misses::record);
        }
        return found;
    }

    /** Nothing but `q`: no trade, no place, no mode, no ceiling. */
    private static boolean onlyAWord(Query query) {
        return query.categorySlugs().isEmpty()
                && query.locality().isEmpty()
                && query.area().isEmpty()
                && query.city().isEmpty()
                && query.priceMax().isEmpty()
                && !query.modes().any();
    }
}
