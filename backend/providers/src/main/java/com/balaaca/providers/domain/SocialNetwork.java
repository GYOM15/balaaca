package com.balaaca.providers.domain;

/**
 * Where else a business can be found, and the one place that says what its
 * handle means.
 *
 * <p>The base belongs here rather than in a template because it is what makes
 * the stored value safe. A provider gives a fragment; the platform decides the
 * scheme and the host. That is the whole reason this column holds a handle
 * instead of a URL: an {@code href} a provider chose entirely is a
 * {@code javascript:} away from being an XSS, and an Instagram icon leading
 * anywhere the provider likes is the platform lending its chrome to a
 * redirect.
 *
 * <p>{@link #WEBSITE} is the exception and it is stated rather than hidden: a
 * business's own site has no base to compose from, so that value IS a URL. What
 * confines it is the database's own CHECK - https, a dotted host, no
 * whitespace - and the {@code rel} the page renders it with.
 *
 * <p>There is no {@code WHATSAPP}. {@code providers.whatsapp_phone_e164} holds
 * that number already and the public page draws it already; a member here would
 * be a second place holding one fact.
 */
public enum SocialNetwork {

    FACEBOOK("https://www.facebook.com/"),
    INSTAGRAM("https://www.instagram.com/"),
    TIKTOK("https://www.tiktok.com/"),
    YOUTUBE("https://www.youtube.com/"),
    LINKEDIN("https://www.linkedin.com/"),
    X("https://x.com/"),

    /** The one that carries a whole address. Composing is the identity. */
    WEBSITE("");

    private final String base;

    SocialNetwork(String base) {
        this.base = base;
    }

    /**
     * The address a reader follows.
     *
     * @param value the handle as the provider typed it, already refused by the
     *              database if it is not one
     */
    public String urlFor(String value) {
        return this == WEBSITE ? value : base + value;
    }

    /**
     * What the form prints in front of the field, so a provider types a handle
     * rather than pasting an address that would be refused.
     */
    public String base() {
        return base;
    }
}
