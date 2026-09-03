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

    /**
     * The square a logo becomes, on a side.
     *
     * <p>Smaller than {@link #STORED_LONG_EDGE} on purpose: the largest place
     * this product draws a mark is seventy-two points, so eight hundred covers
     * a three-times display and nothing beyond it. A logo is fetched on every
     * card of every listing, which is exactly where bytes nobody can see are
     * paid for over and over.
     */
    public static final int SQUARE_SIDE = 800;

    /**
     * The band, in the proportion it is drawn at.
     *
     * <p>Four to one is a choice and it is the only number here worth arguing
     * about, because it IS the height of every provider's page: the band is as
     * wide as the window, so its ratio decides how much of a screen the picture
     * takes before the name appears. It was a fluid width against a capped
     * height before, which is not a ratio at all - it ran from 2.4:1 on a
     * telephone to 6.7:1 on a wide monitor, so no stored shape could have
     * matched it and every screen cropped differently.
     */
    public static final int BANNER_WIDTH = 1600;
    public static final int BANNER_HEIGHT = 400;

    public static SanitisedImage of(byte[] raw, ImageStore.Shape shape) {
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

        BufferedImage shaped = shape(decode(raw), shape);
        return new SanitisedImage(reencode(shaped, format), "image/" + format,
                                 png ? "png" : "jpg");
    }

    private static BufferedImage shape(BufferedImage image, ImageStore.Shape shape) {
        return switch (shape) {
            case FREE -> downscale(image, STORED_LONG_EDGE);
            case SQUARE -> downscale(padToSquare(image), SQUARE_SIDE);
            case BANNER -> downscale(cropToRatio(image, BANNER_WIDTH, BANNER_HEIGHT),
                                     BANNER_WIDTH);
        };
    }

    /**
     * The whole image, centred on a square canvas.
     *
     * <p>Transparent where the source has an alpha channel and white where it
     * does not, which is not a detail: most logos arrive as a JPEG that already
     * carries its own white background, and padding one with anything else
     * draws a coloured frame around a white square. Keeping a PNG's
     * transparency lets the same mark sit on any ground the design chooses.
     */
    private static BufferedImage padToSquare(BufferedImage image) {
        int side = Math.max(image.getWidth(), image.getHeight());
        if (side == image.getWidth() && side == image.getHeight()) {
            return image;
        }
        boolean alpha = image.getColorModel().hasAlpha();
        BufferedImage square = new BufferedImage(side, side,
                alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D canvas = square.createGraphics();
        try {
            if (!alpha) {
                canvas.setColor(java.awt.Color.WHITE);
                canvas.fillRect(0, 0, side, side);
            }
            canvas.drawImage(image, (side - image.getWidth()) / 2,
                             (side - image.getHeight()) / 2, null);
        } finally {
            canvas.dispose();
        }
        return square;
    }

    /**
     * The largest centred rectangle of the wanted proportion that FITS INSIDE
     * the source.
     *
     * <p>Cropping inward rather than scaling to fill, so nothing is ever
     * enlarged: a band built by stretching a small photograph up to sixteen
     * hundred pixels is a blurred band, and the provider did not ask for one.
     * A picture already in the right proportion comes back untouched.
     */
    private static BufferedImage cropToRatio(BufferedImage image, int rw, int rh) {
        int width = image.getWidth();
        int height = image.getHeight();
        // Compared as a cross product: two integer divisions would round the
        // decision itself, and an image one pixel off would crop by hundreds.
        int wanted = Math.min(width, (int) ((long) height * rw / rh));
        int tall = Math.min(height, (int) ((long) width * rh / rw));
        if (wanted == width && tall == height) {
            return image;
        }
        return image.getSubimage(Math.max(0, (width - wanted) / 2),
                                 Math.max(0, (height - tall) / 2),
                                 Math.max(1, wanted), Math.max(1, tall));
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
    private static BufferedImage downscale(BufferedImage image, int bound) {
        int longEdge = Math.max(image.getWidth(), image.getHeight());
        if (longEdge <= bound) {
            return image;
        }

        double factor = (double) bound / longEdge;
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
