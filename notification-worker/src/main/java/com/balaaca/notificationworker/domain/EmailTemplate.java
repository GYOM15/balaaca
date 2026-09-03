package com.balaaca.notificationworker.domain;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * What each kind of message says, in the language its reader speaks.
 *
 * <p>The copy is French because a customer reads it. Everything around it - the
 * kinds, the payload keys, this file - is English, like the rest of the
 * machine.
 *
 * <p>Placeholders are named, not positional, and that is the one deliberate
 * difference from {@link WhatsAppTemplate}. WhatsApp numbers the parameters of
 * an approved template, so their order IS the contract and swapping two of them
 * silently rewrites the message. Nothing outside this repository approves an
 * e-mail, so the safer form is available and there is no reason not to take it:
 * a key that the payload does not carry disappears with its sentence rather
 * than shifting every following value by one.
 *
 * <p>This mapping is not on the notification row, for the reason the row is a
 * snapshot at all: the same row must be sendable by WhatsApp or by e-mail, so
 * it carries what the message MEANS and each transport decides how to say it.
 */
public enum EmailTemplate {

    /**
     * The message a booking owes, and the only one an auto-confirming provider
     * ever sends: {@code BOOKING_ACCEPTED} is planned when somebody accepts a
     * pending request, and a provider that confirms on arrival has nothing left
     * to accept. The row carries no status, so this copy has to be true for a
     * request awaiting a decision and for one already granted, which is why it
     * says the appointment is recorded rather than that it is agreed.
     */
    BOOKING_CONFIRMATION(Audience.CUSTOMER,
            "Votre rendez-vous chez {business_name}",
            "Votre rendez-vous est enregistré",
            "Bonjour {customer_name}, {business_name} a bien reçu votre rendez-vous."),

    BOOKING_ACCEPTED(Audience.CUSTOMER,
            "C'est confirmé chez {business_name}",
            "Votre rendez-vous est confirmé",
            "Bonjour {customer_name}, {business_name} vous attend."),

    REMINDER(Audience.CUSTOMER,
            "Rappel : votre rendez-vous chez {business_name}",
            "C'est bientôt",
            "Bonjour {customer_name}, voici un rappel de votre rendez-vous chez {business_name}."),

    CANCELLATION(Audience.CUSTOMER,
            "Votre rendez-vous chez {business_name} est annulé",
            "Votre rendez-vous est annulé",
            "Bonjour {customer_name}, votre rendez-vous chez {business_name} n'aura pas lieu."),

    RESCHEDULE(Audience.CUSTOMER,
            "Votre rendez-vous chez {business_name} a changé",
            "Votre rendez-vous a été déplacé",
            "Bonjour {customer_name}, {business_name} a déplacé votre rendez-vous. "
            + "Voici la nouvelle date."),

    // To the provider. Their own business name would tell them nothing; whose
    // appointment it is, is the whole message.
    BOOKING_NOTICE(Audience.PROVIDER,
            "Nouveau rendez-vous : {customer_name}",
            "Nouveau rendez-vous",
            "{customer_name} vient de prendre rendez-vous."),

    CANCELLATION_NOTICE(Audience.PROVIDER,
            "Annulation : {customer_name}",
            "Un rendez-vous a été annulé",
            "{customer_name} a annulé son rendez-vous."),

    RESCHEDULE_NOTICE(Audience.PROVIDER,
            "Rendez-vous déplacé : {customer_name}",
            "Un rendez-vous a été déplacé",
            "{customer_name} a déplacé son rendez-vous.");

    /** Who is reading, which is what decides whether a name is theirs or somebody else's. */
    public enum Audience {
        CUSTOMER,
        PROVIDER
    }

    private final Audience audience;
    private final String subject;
    private final String heading;
    private final String lead;

    EmailTemplate(Audience audience, String subject, String heading, String lead) {
        this.audience = audience;
        this.subject = subject;
        this.heading = heading;
        this.lead = lead;
    }

    /** @return the template for a notification's kind, or empty when none covers it */
    public static Optional<EmailTemplate> forKind(String kind) {
        for (EmailTemplate t : values()) {
            if (t.name().equals(kind)) {
                return Optional.of(t);
            }
        }
        return Optional.empty();
    }

    public Audience audience() {
        return audience;
    }

    public String subject(Map<String, String> payload) {
        return fill(subject, payload);
    }

    public String heading(Map<String, String> payload) {
        return fill(heading, payload);
    }

    public String lead(Map<String, String> payload) {
        return fill(lead, payload);
    }

    /**
     * The facts, as label and value, in the order they are read.
     *
     * <p>A row whose value the payload does not carry is left out rather than
     * printed empty: a cancellation is planned without a duration, and "Durée :"
     * followed by nothing reads as a bug to the person it was sent to.
     */
    public Map<String, String> details(Map<String, String> payload) {
        Map<String, String> rows = new LinkedHashMap<>();
        if (audience == Audience.PROVIDER) {
            put(rows, "Client", payload.get("customer_name"));
        }
        put(rows, "Service", payload.get("service_name"));
        put(rows, "Date", payload.get("starts_at_local"));
        String minutes = payload.get("duration_minutes");
        put(rows, "Durée", minutes == null || minutes.isBlank() ? null : minutes + " minutes");
        return rows;
    }

    private static void put(Map<String, String> rows, String label, String value) {
        if (value != null && !value.isBlank()) {
            rows.put(label, value);
        }
    }

    /**
     * A key the payload does not carry becomes nothing, and the message still
     * goes.
     *
     * <p>The same trade the WhatsApp adapter already makes, for the same
     * reason: a sentence with a gap in it reaches a customer who was expecting
     * to hear from a salon, and a refusal reaches nobody. Leaving the braces in
     * place is the one outcome ruled out - it would send {@code
     * {business_name}} to a human being.
     */
    private static String fill(String pattern, Map<String, String> payload) {
        StringBuilder out = new StringBuilder(pattern.length());
        int at = 0;
        while (at < pattern.length()) {
            int open = pattern.indexOf('{', at);
            int close = open < 0 ? -1 : pattern.indexOf('}', open);
            if (close < 0) {
                out.append(pattern, at, pattern.length());
                break;
            }
            out.append(pattern, at, open)
               .append(payload.getOrDefault(pattern.substring(open + 1, close), ""));
            at = close + 1;
        }
        return out.toString();
    }
}
