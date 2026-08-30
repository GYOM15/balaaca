package com.balaaca.notificationworker.domain;

import java.util.Optional;
import java.util.UUID;

/**
 * A row this worker has claimed, and everything it will ever know about it.
 *
 * <p>There is no appointment here, no customer and no offering, because the
 * worker's database role cannot read those tables. That is not a limitation to
 * work around: it is what keeps a drain bug from becoming a cross-tenant leak,
 * and what keeps a message truthful about the moment it was owed rather than
 * about whatever the data says by the time it is sent.
 *
 * @param payload  the template variables as raw JSON, rendered by the channel
 * @param attempts how many sends have already failed, for the backoff
 */
public record ClaimedNotification(UUID id,
                                  UUID providerId,
                                  String kind,
                                  Optional<String> toPhoneE164,
                                  Optional<String> toEmail,
                                  String locale,
                                  String payload,
                                  String dedupeKey,
                                  int attempts) {
}
