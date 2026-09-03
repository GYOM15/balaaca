package com.balaaca.providers.ports.inbound;

import java.util.List;
import java.util.Optional;

/**
 * The map a business is filed against, and the quartiers providers wrote
 * themselves.
 *
 * <p>Two halves of one question, deliberately modelled differently. The
 * localities are CLOSED - eight regions, thirty-three prefectures, ten communes
 * of Conakry - complete for the whole country and changed only by migration.
 * The areas are not: Guinea has thousands of quartiers and rural districts, the
 * platform does not author them, and a curated list of them would be missing
 * exactly the neighbourhood the next provider lives in.
 *
 * <p>So one is reference data and the other grows from registrations. What
 * keeps the second from fragmenting into "Ratoma", "ratoma" and "Commune de
 * Ratoma" is a fold on write plus this type-ahead on read - not a taxonomy
 * nobody could finish.
 */
public interface ListLocalitiesUseCase {

    List<Locality> all();

    /**
     * The canonical slug for what somebody typed, or empty for a name the
     * published map does not hold.
     *
     * <p>Here rather than only on the outbound side because {@code booking}
     * needs it too: a customer giving an intervention address may name a
     * commune, and a slug nobody can filter on is worse than an empty field.
     * Modules ask each other through ports, so this is the port.
     */
    Optional<String> canonicalSlug(String slugOrAlias);

    /**
     * The quartiers already written, most used first.
     *
     * @param within narrows to one region, prefecture or commune - the
     *               quartiers of Ratoma rather than of the whole country
     */
    List<Area> areas(Optional<String> contains, Optional<String> within);

    /**
     * @param parentSlug empty on a region, which is a root
     * @param providerCount how many businesses the directory returns for this
     *                      slug, counted DOWN THE TREE exactly as the filter
     *                      matches: a commune counts its own, a prefecture
     *                      counts its own plus its communes. The number labels
     *                      a filter, so it has to be the size of what the
     *                      filter returns - counting only rows filed at this
     *                      exact level would make every prefecture read as
     *                      empty while the list behind it held dozens. These
     *                      therefore OVERLAP and must never be summed
     */
    record Locality(String slug, String labelFr, String kind,
                    Optional<String> parentSlug, Optional<String> iso31662,
                    int providerCount) {
    }

    record Area(String label, int providerCount) {
    }
}
