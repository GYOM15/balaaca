package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.Directory;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.Query;

/**
 * The directory's statements, and nothing else.
 *
 * <p>It exists because the SQL class used to implement the INBOUND use case
 * directly, which is the same shape `ReviewModerationSqlRepository` had: a
 * REST-facing operation living in an outbound adapter, with no application
 * layer to hold anything that is not a statement.
 *
 * <p>What fell through that gap here is what happens AFTER a search finds
 * nothing. Recording a miss is a decision about the result, not a way of
 * fetching one, and putting it inside the query would mean a public read path
 * writing a row in the middle of its own statement.
 */
public interface ProviderDirectoryRepository {

    Directory search(Query query);
}
