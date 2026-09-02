package com.balaaca.booking.adapters.outbound.ratelimit;

import com.balaaca.booking.ports.outbound.GuessBudget;
import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.value.GetExArgs;
import io.quarkus.redis.datasource.value.ValueCommands;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import org.jboss.logging.Logger;

/**
 * The counter, in Redis, and it FAILS CLOSED.
 *
 * <p>That is the whole reason this class exists beside
 * {@code RedisAttemptLimiter}, which does the same INCR and fails open. The
 * decision is not about which is safer in general - it is about what is being
 * protected. An unreachable Redis on the registration path costs an abuse risk
 * nobody has seen; an unreachable Redis here costs the only thing making a
 * six-symbol capability safe to publish, and an attacker who can reach this API
 * can very likely tell when it happens. So the outage is answered with 429 and a
 * Retry-After: the customer following the link in their confirmation is told to
 * come back in a few minutes, which is a bad afternoon, and the alternative is
 * an unmetered oracle over 887 million references.
 *
 * <p>The warning is what makes this a decision rather than a silent refusal. The
 * key is deliberately absent from it: it holds a network address, and an
 * operator needs to know the counter is gone, not who was asking.
 */
@ApplicationScoped
public class RedisGuessBudget implements GuessBudget {

    private static final Logger LOG = Logger.getLogger(RedisGuessBudget.class);

    private final ValueCommands<String, Long> counters;

    public RedisGuessBudget(RedisDataSource redis) {
        this.counters = redis.value(String.class, Long.class);
    }

    @Override
    public boolean hasBudget(String key, int allowed) {
        try {
            Long spent = counters.get(key);
            return spent == null || spent < allowed;
        } catch (RuntimeException e) {
            LOG.warnf(e, "ratelimit.unavailable scope=booking_reference refusing=true");
            return false;
        }
    }

    @Override
    public void charge(String key, Duration window) {
        try {
            // INCR then set the expiry on the first miss only. Setting it every
            // time turns a ten-minute budget into one that never resets while
            // somebody keeps guessing - which sounds stricter and is the
            // opposite: the window never rolls for the honest caller either.
            if (counters.incr(key) == 1) {
                counters.getex(key, new GetExArgs().ex(window));
            }
        } catch (RuntimeException e) {
            // Nothing to do about it here, and nothing is let through by it:
            // the read above refuses while Redis is unreachable.
            LOG.warnf(e, "ratelimit.uncounted scope=booking_reference");
        }
    }
}
