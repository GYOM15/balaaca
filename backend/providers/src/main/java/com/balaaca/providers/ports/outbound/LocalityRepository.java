package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.ListLocalitiesUseCase.Area;
import com.balaaca.providers.ports.inbound.ListLocalitiesUseCase.Locality;
import java.util.List;
import java.util.Optional;

/** Reference data and, beside it, what providers have written for themselves. */
public interface LocalityRepository {

    List<Locality> all();

    List<Area> areas(Optional<String> contains, Optional<String> within);

    /**
     * The canonical slug for what somebody typed, by slug or accepted spelling.
     *
     * <p>Empty for a name this map does not hold, which the caller turns into a
     * 400 rather than storing as no locality at all - a business or a booking
     * filed nowhere appears under no filter and nobody is ever told why.
     *
     * <p>Returns the slug rather than the id, so the two write paths that need
     * it can resolve the row in their own statement instead of carrying a
     * foreign key through an application layer that has no use for one.
     */
    Optional<String> canonicalSlug(String slugOrAlias);
}
