package com.balaaca.notificationworker.ports;

import jakarta.enterprise.util.AnnotationLiteral;
import jakarta.inject.Qualifier;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * The name an operator writes in {@code balaaca.notification.channel} to select
 * an adapter.
 *
 * <p>It replaced a {@code @LookupIfProperty} on each adapter, which could only
 * ever admit one of them: exact string equality against a single property. Two
 * rows in one batch can now want different transports, so more than one adapter
 * has to be available at once and the property has to be a list. The condition
 * therefore moves out of the adapters and into the router, which is the only
 * place that reads the property at all.
 *
 * <p>Qualified rather than named, so that injecting a plain
 * {@link NotificationChannel} resolves to the router and never to one transport
 * by accident.
 */
@Qualifier
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER})
public @interface ChannelNamed {

    String value();

    /** For {@code Instance.select}, which needs the annotation as a value. */
    final class Literal extends AnnotationLiteral<ChannelNamed> implements ChannelNamed {

        private static final long serialVersionUID = 1L;

        private final String value;

        private Literal(String value) {
            this.value = value;
        }

        public static Literal of(String value) {
            return new Literal(value);
        }

        @Override
        public String value() {
            return value;
        }
    }
}
