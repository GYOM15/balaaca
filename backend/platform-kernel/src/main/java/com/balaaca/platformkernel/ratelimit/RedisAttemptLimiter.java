package com.balaaca.platformkernel.ratelimit;

import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.value.ValueCommands;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import org.jboss.logging.Logger;

/**
 * The counter, in Redis.
 *
 * <p>INCR then EXPIRE on the first attempt only, so the window starts when the
 * first attempt is made and does not slide forward with every subsequent one -
 * which is what a naive "set the expiry every time" does, and it turns an hourly
 * budget into a budget that never resets while somebody keeps trying.
 *
 * <p>Not a transaction. INCR is atomic on its own and that is the value that
 * decides; the EXPIRE that follows can only lose a race against another caller
 * doing the same thing, and both set the same window.
 */
@ApplicationScoped
public class RedisAttemptLimiter implements AttemptLimiter {

    private static final Logger LOG = Logger.getLogger(RedisAttemptLimiter.class);

    private final ValueCommands<String, Long> counters;

    public RedisAttemptLimiter(RedisDataSource redis) {
        this.counters = redis.value(String.class, Long.class);
    }

    @Override
    public boolean withinBudget(String key, int allowed, Duration window) {
        try {
            long used = counters.incr(key);
            if (used == 1) {
                counters.getex(key, new io.quarkus.redis.datasource.value.GetExArgs()
                        .ex(window));
            }
            return used <= allowed;
        } catch (RuntimeException e) {
            // Fail OPEN, and say so out loud. A limiter that fails closed turns
            // an unreachable Redis into an outage of the only route by which a
            // salon can sign up - trading an abuse risk we have never seen for
            // a certainty that nobody can register. The log line is what makes
            // this a decision rather than a silent hole.
            LOG.warnf(e, "ratelimit.unavailable key=%s allowing=true", key);
            return true;
        }
    }
}
