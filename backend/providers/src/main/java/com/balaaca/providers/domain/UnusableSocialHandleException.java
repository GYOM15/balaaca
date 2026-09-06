package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The value is not a handle this network could have issued.
 *
 * <p>Raised from the SQLSTATE of the CHECK that refused it, rather than from a
 * regular expression in Java. That is deliberate: the constraint is what
 * enforces the rule for every writer, including a migration and a {@code psql}
 * session, and a second copy of the pattern here would be a second definition to
 * keep in step. This class translates the refusal; it does not restate it.
 *
 * <p>It names the network and nothing else. The constraint's own name is a fact
 * about the schema and never reaches a client.
 */
public final class UnusableSocialHandleException extends DomainException {

    public UnusableSocialHandleException(SocialNetwork kind) {
        super("VALIDATION_FAILED", 400,
              kind == SocialNetwork.WEBSITE
                      ? "A website address must begin with https:// and name a domain"
                      : "That is not a usable handle for this network",
              Map.of("kind", kind.name()));
    }
}
