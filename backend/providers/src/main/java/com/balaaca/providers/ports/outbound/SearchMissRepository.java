package com.balaaca.providers.ports.outbound;

/**
 * What somebody looked for and the directory could not answer.
 *
 * <p>It exists because the synonym list nobody has is not a thing to invent.
 * A customer who types "coiffeur" and is shown nothing knows a word this
 * taxonomy does not, and no amount of thinking in an office produces that
 * word - every directory of any size builds the list by harvesting the
 * failures rather than guessing at them.
 *
 * <p>Its own port rather than a method on the directory, because it is a WRITE
 * on a read path and that is worth being able to see: a search answers whether
 * it succeeds or not, and nothing here may ever be allowed to fail the search
 * it is recording.
 */
public interface SearchMissRepository {

    /**
     * Counts one more search for this term.
     *
     * <p>One row per distinct term rather than one per search: the table is
     * then bounded by how many different things people type rather than by how
     * often, and the number that matters - how many people wanted this - is
     * the row itself.
     */
    void record(String term);
}
