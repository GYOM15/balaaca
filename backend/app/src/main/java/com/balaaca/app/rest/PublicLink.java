package com.balaaca.app.rest;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Map;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * The address a customer reaches a provider at, and the square that carries it.
 *
 * <p>The "short link" is the public page URL and nothing more. A shorter one -
 * the slug at the root of the domain - is a routing decision rather than a
 * backend one, and it would collide with the site's own pages the day somebody
 * registers a salon called "professionnels".
 *
 * <p>SVG rather than PNG, on purpose. A provider prints this: on a card, on a
 * window, on the back of a receipt. A raster has one size and it is the wrong
 * one at the printer's; a vector has none. It also avoids the `javase` artifact
 * and the image I/O that comes with it, because the matrix is walked here.
 */
@ApplicationScoped
public class PublicLink {

    /**
     * Q, not L. A QR code on a shopfront gets rained on, scuffed, and
     * photographed at an angle - twenty-five per cent recoverable is the level
     * printed codes are made at, and the extra density costs nothing on a
     * string this short.
     */
    private static final ErrorCorrectionLevel CORRECTION = ErrorCorrectionLevel.Q;

    /** Modules, not pixels: the SVG scales, so this is only the grid. */
    private static final int SIZE = 33;

    private final String baseUrl;

    public PublicLink(@ConfigProperty(name = "balaaca.public.base-url") String baseUrl) {
        // Trailing slashes are the classic way to end up with a double slash in
        // something printed on a card.
        this.baseUrl = baseUrl.endsWith("/")
                ? baseUrl.substring(0, baseUrl.length() - 1)
                : baseUrl;
    }

    public String urlFor(String slug) {
        return baseUrl + "/p/" + slug;
    }

    /** @return an SVG document, sized in modules and scaled by whoever draws it */
    public String qrCodeFor(String slug) {
        BitMatrix matrix;
        try {
            matrix = new QRCodeWriter().encode(urlFor(slug), BarcodeFormat.QR_CODE,
                    SIZE, SIZE, Map.of(EncodeHintType.ERROR_CORRECTION, CORRECTION,
                                       // Four modules, which the specification
                                       // requires: a code with no quiet zone
                                       // will not scan against a busy poster.
                                       EncodeHintType.MARGIN, 4));
        } catch (WriterException e) {
            // The input is a URL we built from a slug the schema already bounds,
            // so this cannot happen for a reason a caller could act on.
            throw new IllegalStateException("could not encode " + slug, e);
        }

        StringBuilder svg = new StringBuilder(4096);
        svg.append("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ")
           .append(matrix.getWidth()).append(' ').append(matrix.getHeight())
           .append("\" shape-rendering=\"crispEdges\">")
           // White explicitly. A transparent background inverts on a dark page
           // and stops scanning, which is exactly where a provider would try it.
           .append("<rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>")
           .append("<path fill=\"#000000\" d=\"");

        // One path rather than a rect per module: a 33-module code is over a
        // thousand elements, and a browser asked to lay out a thousand rects
        // for a thumbnail does noticeably more work than it needs to.
        for (int y = 0; y < matrix.getHeight(); y++) {
            for (int x = 0; x < matrix.getWidth(); x++) {
                if (matrix.get(x, y)) {
                    svg.append('M').append(x).append(' ').append(y).append("h1v1h-1z");
                }
            }
        }
        return svg.append("\"/></svg>").toString();
    }
}
