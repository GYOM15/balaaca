package com.balaaca.catalog.adapters.outbound.persistence;

import com.balaaca.catalog.ports.inbound.Fulfilment;
import java.util.EnumSet;
import java.util.Set;

/**
 * The three boolean columns V044 added, read as the set they encode.
 *
 * <p>One place, because three repositories select them and a mapping written
 * three times is a mapping that disagrees with itself the day a fourth mode
 * arrives. The columns are NOT NULL and a CHECK refuses all three false, so the
 * result is never empty.
 */
final class OfferedModes {

    private OfferedModes() {
    }

    static Set<Fulfilment> of(boolean onSite, boolean dropOff, boolean atCustomer) {
        Set<Fulfilment> offered = EnumSet.noneOf(Fulfilment.class);
        if (onSite) {
            offered.add(Fulfilment.ON_SITE);
        }
        if (dropOff) {
            offered.add(Fulfilment.DROP_OFF);
        }
        if (atCustomer) {
            offered.add(Fulfilment.AT_CUSTOMER);
        }
        return offered;
    }
}
