package com.balaaca.platformkernel.media;


import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/**
 * An image a provider publishes, after the platform has satisfied itself that it
 * is one.
 *
 * <p>An adapter and not a domain type, and ArchUnit is right to insist: this
 * class exists to drive {@code javax.imageio}, and a domain that knows how to
 * decode a PNG is a domain that changes when a decoder does.
 *
 * <p>Four things happen here and each one closes something.
 *
 * <ul>
 *   <li><b>The type comes from the bytes, not the header.</b> A declared
 *       Content-Type is a claim; the first bytes are a fact, and the two differ
 *       exactly when someone wants them to.
 *   <li><b>Dimensions are read before the image is decoded.</b> A 200-byte PNG
 *       can declare 60000x60000 and cost gigabytes to decompress. Reading the
 *       header first is the difference between refusing that file and dying of
 *       it.
 *   <li><b>The image is re-encoded, always.</b> That proves a decoder accepted
 *       it end to end, and it drops every piece of metadata that arrived with
 *       it - including the GPS coordinates a phone writes into a photo without
 *       being asked, which a salon would otherwise publish on its own page.
 *   <li><b>Only two formats.</b> Every additional decoder is additional attack
 *       surface, and a market on mid-range Android phones produces JPEG and PNG.
 * </ul>
 */
public record SanitisedImage(byte[] content, String contentType, String extension) {

    private static final byte[] JPEG_MAGIC = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG_MAGIC =
            {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};

    /** Beyond this a phone photo has been sent untouched, and it is refused kindly. */
    public static final int MAX_BYTES = 5 * 1024 * 1024;

    /** Neither dimension may exceed this before decoding is even attempted. */
    public static final int MAX_DIMENSION = 6000;

    /**
     * What is actually STORED, on the long edge.
     *
     * <p>Two problems, one change, and the second was not the one being solved.
     *
     * <p>The first is weight. Nothing resized before this, so a five-megabyte
     * photograph straight off a telephone was served as a logo - to a
     * mid-range Android on 3G, which is the market. Sixteen hundred pixels is
     * larger than any place this product shows an image and small enough that
     * a catalogue of them loads.
     *
     * <p>The second is steganography, and it falls out for free. Re-encoding
     * already destroyed anything hidden in metadata, and JPEG's lossy pass
     * destroyed most of what was hidden in pixels - but PNG to PNG is
     * LOSSLESS, so a payload in the least significant bits survived it
     * perfectly. Resampling does not care: the pixel grid is rebuilt from
     * neighbours, and there are no original low bits left to carry anything.
     */
    public static final int STORED_LONG_EDGE = 1600;

    public SanitisedImage {
        content = content.clone();
    }

    @Override
    public byte[] content() {
        return content.clone();
    }

    public static SanitisedImage of(byte[] raw) {
        if (raw == null || raw.length == 0) {
            throw new ImageRejectedException("the body is empty");
        }
        if (raw.length > MAX_BYTES) {
            throw new ImageRejectedException("larger than 5 MB");
        }

        boolean png = startsWith(raw, PNG_MAGIC);
        if (!png && !startsWith(raw, JPEG_MAGIC)) {
            throw new ImageRejectedException("only JPEG and PNG are accepted");
        }

        String format = png ? "png" : "jpeg";
        refuseIfTooLargeToDecode(raw, format);

        BufferedImage decoded = downscale(decode(raw));
        return new SanitisedImage(reencode(decoded, format), "image/" + format,
                                 png ? "png" : "jpg");
    }

    /**
     * Reads the header only. ImageIO exposes the declared size before any pixel
     * is decompressed, which is the whole point: a decompression bomb is refused
     * on the strength of what it claims to be.
     */
    private static void refuseIfTooLargeToDecode(byte[] raw, String format) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(raw))) {
            Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format);
            if (!readers.hasNext()) {
                throw new ImageRejectedException("no decoder for that format");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                if (reader.getWidth(0) > MAX_DIMENSION || reader.getHeight(0) > MAX_DIMENSION) {
                    throw new ImageRejectedException("wider or taller than 6000 pixels");
                }
            } finally {
                reader.dispose();
            }
        } catch (IOException | IllegalArgumentException e) {
            throw new ImageRejectedException("the file could not be read as an image");
        }
    }

    private static BufferedImage decode(byte[] raw) {
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(raw));
            if (image == null) {
                // A file whose first bytes say JPEG and whose rest does not.
                throw new ImageRejectedException("the file could not be read as an image");
            }
            return image;
        } catch (IOException e) {
            throw new ImageRejectedException("the file could not be read as an image");
        }
    }

    /**
     * Down to the stored long edge, and never up.
     *
     * <p>An image already smaller is returned untouched: enlarging it would
     * cost bytes to invent detail that is not there. The aspect ratio is kept,
     * because the alternative is deciding what to crop out of somebody's
     * photograph of their own work.
     *
     * <p>SCALE_SMOOTH rather than a raw drawImage: the fast path leaves visible
     * aliasing on the fine, repeating patterns this market photographs most -
     * braids, fabric, tiling - and a picture of braids that looks wrong is
     * worse than no picture.
     */
    private static BufferedImage downscale(BufferedImage image) {
        int longEdge = Math.max(image.getWidth(), image.getHeight());
        if (longEdge <= STORED_LONG_EDGE) {
            return image;
        }

        double factor = (double) STORED_LONG_EDGE / longEdge;
        int width = Math.max(1, (int) Math.round(image.getWidth() * factor));
        int height = Math.max(1, (int) Math.round(image.getHeight() * factor));

        // TYPE_INT_ARGB keeps a PNG's transparency through the resize; the JPEG
        // path flattens it onto white afterwards, where it already did.
        BufferedImage scaled = new BufferedImage(width, height,
                java.awt.image.BufferedImage.TYPE_INT_ARGB);
        java.awt.Graphics2D canvas = scaled.createGraphics();
        try {
            canvas.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,
                    java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            canvas.setRenderingHint(java.awt.RenderingHints.KEY_RENDERING,
                    java.awt.RenderingHints.VALUE_RENDER_QUALITY);
            canvas.drawImage(image.getScaledInstance(width, height,
                    java.awt.Image.SCALE_SMOOTH), 0, 0, null);
        } finally {
            canvas.dispose();
        }
        return scaled;
    }

    private static byte[] reencode(BufferedImage image, String format) {
        // JPEG has no alpha channel. Writing an image that has one produces a
        // file some decoders render with inverted colours, so the transparency
        // is flattened onto white rather than carried into a format that cannot
        // hold it.
        BufferedImage source = "jpeg".equals(format) && image.getColorModel().hasAlpha()
                ? flattenOntoWhite(image)
                : image;

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            if (!ImageIO.write(source, format, out)) {
                throw new ImageRejectedException("no encoder for that format");
            }
        } catch (IOException e) {
            throw new ImageRejectedException("the image could not be re-encoded");
        }
        return out.toByteArray();
    }

    private static BufferedImage flattenOntoWhite(BufferedImage image) {
        BufferedImage flat = new BufferedImage(image.getWidth(), image.getHeight(),
                                               BufferedImage.TYPE_INT_RGB);
        var graphics = flat.createGraphics();
        try {
            graphics.setColor(java.awt.Color.WHITE);
            graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
            graphics.drawImage(image, 0, 0, null);
        } finally {
            graphics.dispose();
        }
        return flat;
    }

    private static boolean startsWith(byte[] raw, byte[] magic) {
        if (raw.length < magic.length) {
            return false;
        }
        for (int i = 0; i < magic.length; i++) {
            if (raw[i] != magic[i]) {
                return false;
            }
        }
        return true;
    }
}
