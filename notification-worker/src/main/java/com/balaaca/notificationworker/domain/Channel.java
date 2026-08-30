package com.balaaca.notificationworker.domain;

/**
 * The transports a row may record as {@code channel_used}. Exactly the three the
 * column's CHECK admits: a value this enum could hold and the column could not
 * would fail at the end of a send that already succeeded.
 */
public enum Channel {
    WHATSAPP,
    SMS,
    EMAIL
}
