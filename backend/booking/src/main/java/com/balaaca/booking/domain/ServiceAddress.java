package com.balaaca.booking.domain;

import java.util.Optional;

/**
 * Where the provider is going.
 *
 * <p>Three fields and no coordinates. A latitude and longitude - or a Plus
 * Code, which is the same thing with the decimal point moved - is a
 * surveillance-grade fact about a private home, and nothing in this product
 * reads one: there is no map, no routing, no dispatch and no distance sort. A
 * column for it would be a liability stored for a feature that does not exist,
 * and something would fill it.
 *
 * <p>What is here is what a tradesman asks on the phone: which commune, which
 * quartier, and how to find the door. A customer pasting a Plus Code into the
 * directions is doing the right thing - it is exactly the useful thing to paste
 * in a city with few street addresses - and it is kept as the words they wrote.
 *
 * @param localitySlug one of the published map's slugs, or empty. Optional even
 *                     on a call-out: "Nongo, behind the mosque" tells the
 *                     plumber everything, and refusing the booking over a
 *                     missing dropdown would lose it
 * @param directions the one required field, because it is the one that actually
 *                   gets the tradesman there
 */
public record ServiceAddress(Optional<String> localitySlug,
                             Optional<String> area,
                             String directions) {

    public ServiceAddress {
        if (directions == null || directions.isBlank()) {
            throw new IllegalArgumentException("directions are required on a call-out");
        }
        directions = directions.trim();
    }
}
