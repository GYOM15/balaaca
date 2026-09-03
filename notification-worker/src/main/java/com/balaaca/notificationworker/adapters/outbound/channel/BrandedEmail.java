package com.balaaca.notificationworker.adapters.outbound.channel;

import com.balaaca.notificationworker.domain.EmailTemplate;
import java.util.Map;

/**
 * The shell every message this worker sends is drawn in.
 *
 * <p>Tables and inline styles, and that is not carelessness: Gmail strips a
 * {@code <style>} block on a forwarded message, Outlook renders a {@code <div>}
 * layout at the wrong width, and no mail client has ever supported a custom
 * property. So the colours are written as hex, each one named for the design
 * token it came from, exactly as
 * {@code infrastructure/keycloak/themes/balaaca/email/html/template.ftl} does.
 * The two shells are the same product and are deliberately the same shape; they
 * cannot be one file because Keycloak renders FreeMarker inside its own
 * container and this runs in a JVM that has never heard of it.
 *
 * <p>Both parts are built here and both are sent. A message with no text part
 * is scored as spam by every filter that matters, and a customer reading it on
 * a mid-range Android with images off gets the part that still says something.
 */
public final class BrandedEmail {

    // --bg / --p-warm-050
    private static final String BG = "#FAF8F2";
    // --surface / --p-warm-000
    private static final String SURFACE = "#FFFFFF";
    // --bg-sunken / --p-warm-100
    private static final String SUNKEN = "#F3F0E7";
    // --border
    private static final String BORDER = "#E4E0D4";
    // --brand / --p-green-700
    private static final String BRAND = "#123C35";
    // --accent-strong / --p-gold-700
    private static final String ACCENT = "#7E6023";
    // --text / --p-warm-900
    private static final String TEXT = "#17201E";
    // --text-secondary / --p-warm-700
    private static final String TEXT_SECONDARY = "#505653";
    // --text-tertiary / --p-warm-600
    private static final String TEXT_TERTIARY = "#666C69";
    // --r-md, and the 8px the design system uses for the smaller blocks.
    private static final String RADIUS_CARD = "12px";
    private static final String RADIUS_BLOCK = "8px";

    private static final String FONT =
            "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
            + "Helvetica,Arial,sans-serif";

    /** Why they got it, so a message nobody asked for is recognisable as one. */
    private static final String WHY =
            "Vous recevez ce message parce qu'un rendez-vous a été pris avec "
            + "cette adresse sur Balaaca.";

    private BrandedEmail() {
    }

    public static String html(EmailTemplate template, Map<String, String> payload) {
        String heading = template.heading(payload);
        String lead = template.lead(payload);
        StringBuilder card = new StringBuilder();
        card.append("""
                <h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;\
                line-height:1.25;color:%s;">%s</h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:%s;">%s</p>
                """.formatted(TEXT, escape(heading), TEXT_SECONDARY, escape(lead)));

        Map<String, String> details = template.details(payload);
        if (!details.isEmpty()) {
            card.append("""
                    <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" \
                    border="0" style="margin:24px 0 0;background:%s;border-radius:%s;">
                    <tr><td style="padding:18px 20px;font-family:%s;">
                    """.formatted(SUNKEN, RADIUS_BLOCK, FONT));
            boolean first = true;
            for (Map.Entry<String, String> row : details.entrySet()) {
                card.append("""
                        <p style="margin:%s;font-size:13px;line-height:1.5;color:%s;">%s</p>
                        <p style="margin:2px 0 0;font-size:15px;font-weight:700;line-height:1.5;\
                        color:%s;">%s</p>
                        """.formatted(first ? "0" : "14px 0 0", TEXT_TERTIARY,
                                      escape(row.getKey()), TEXT, escape(row.getValue())));
                first = false;
            }
            card.append("</td></tr></table>\n");
        }

        String reference = payload.get("booking_reference");
        if (reference != null && !reference.isBlank()) {
            // The customer's only way back to this appointment, and the only
            // thing that authorises cancelling it. The planner puts it in the
            // confirmation and in no other message, so it is printed where it
            // is found rather than asked for by kind.
            card.append("""
                    <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" \
                    border="0" style="margin:20px 0 0;border:1px solid %s;border-radius:%s;">
                    <tr><td style="padding:16px 20px;font-family:%s;">
                    <p style="margin:0;font-size:13px;line-height:1.5;color:%s;">\
                    Votre code de rendez-vous</p>
                    <p style="margin:4px 0 0;font-size:20px;font-weight:800;letter-spacing:.08em;\
                    color:%s;">%s</p>
                    <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:%s;">\
                    Gardez ce code&nbsp;: il vous permet de retrouver ou d'annuler ce \
                    rendez-vous.</p>
                    </td></tr></table>
                    """.formatted(BORDER, RADIUS_BLOCK, FONT, TEXT_TERTIARY,
                                  BRAND, escape(reference), TEXT_TERTIARY));
        }

        return """
                <!DOCTYPE html>
                <html lang="fr">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                  <meta name="color-scheme" content="light">
                  <meta name="supported-color-schemes" content="light">
                  <title>%s</title>
                </head>
                <body style="margin:0;padding:0;background:%s;">
                  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">%s</div>
                  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" \
                border="0" style="background:%s;">
                    <tr><td align="center" style="padding:32px 16px;">
                      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" \
                border="0" style="max-width:520px;">
                        <tr><td align="center" style="padding-bottom:24px;">
                          <span style="font-family:%s;font-size:20px;font-weight:800;\
                letter-spacing:-.03em;color:%s;">Bala<span style="color:%s;">a</span>ca</span>
                        </td></tr>
                        <tr><td style="background:%s;border:1px solid %s;border-radius:%s;\
                padding:32px 28px;font-family:%s;">
                %s
                        </td></tr>
                        <tr><td align="center" style="padding-top:20px;font-family:%s;\
                font-size:12px;line-height:1.6;color:%s;">%s</td></tr>
                      </table>
                    </td></tr>
                  </table>
                </body>
                </html>
                """.formatted(escape(heading), BG, escape(lead), BG, FONT, TEXT, ACCENT,
                              SURFACE, BORDER, RADIUS_CARD, FONT, card, FONT,
                              TEXT_TERTIARY, WHY);
    }

    /**
     * The same message with nothing to render.
     *
     * <p>Not a stripped copy of the HTML: a text part built by deleting tags
     * reads like a form, and this one is what a client with images off, a
     * screen reader, or a spam filter looking for a multipart/alternative
     * actually sees.
     */
    public static String text(EmailTemplate template, Map<String, String> payload) {
        StringBuilder out = new StringBuilder();
        out.append(template.heading(payload)).append("\n\n")
           .append(template.lead(payload)).append('\n');

        Map<String, String> details = template.details(payload);
        if (!details.isEmpty()) {
            out.append('\n');
            details.forEach((label, value) -> out.append(label).append(" : ").append(value)
                                                 .append('\n'));
        }

        String reference = payload.get("booking_reference");
        if (reference != null && !reference.isBlank()) {
            out.append("\nVotre code de rendez-vous : ").append(reference).append('\n')
               .append("Gardez ce code : il vous permet de retrouver ou d'annuler ce "
                       + "rendez-vous.\n");
        }

        return out.append("\n--\nBalaaca\n").append(WHY).append('\n').toString();
    }

    /**
     * The payload is a customer's own text: a salon called "Chez B&amp;B" and a
     * service called {@code <<Tresses>>} are both ordinary, and both break a
     * page that pastes them in raw.
     */
    private static String escape(String value) {
        return value.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace("\"", "&quot;")
                    .replace("'", "&#39;");
    }
}
