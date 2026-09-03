package com.balaaca.platformkernel.media;


import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * What the platform will and will not publish on a provider's page.
 *
 * <p>Every case here is something an ordinary upload form gets wrong. A phone
 * sends a photo carrying its GPS coordinates; a curious visitor sends a shell
 * script named .jpg; a small PNG declares dimensions that would cost gigabytes
 * to decompress. None of those is exotic, and none of them is caught by
 * trusting the Content-Type.
 */
class SanitisedImageTest {

    private static byte[] image(String format, int width, int height, boolean alpha) {
        BufferedImage source = new BufferedImage(width, height,
                alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        var g = source.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, width / 2, height);
        g.dispose();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(source, format, out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    private static byte[] concat(byte[] first, byte[] second) {
        byte[] joined = new byte[first.length + second.length];
        System.arraycopy(first, 0, joined, 0, first.length);
        System.arraycopy(second, 0, joined, first.length, second.length);
        return joined;
    }

    @Nested
    @DisplayName("What is accepted")
    class Accepted {

        @Test
        @DisplayName("A JPEG comes back a JPEG")
        void acceptsAJpeg() {
            SanitisedImage accepted = SanitisedImage.of(image("jpeg", 100, 80, false), ImageStore.Shape.FREE);

            assertThat(accepted.contentType()).isEqualTo("image/jpeg");
            assertThat(accepted.extension()).isEqualTo("jpg");
            assertThat(accepted.content()).isNotEmpty();
        }

        @Test
        @DisplayName("A PNG comes back a PNG")
        void acceptsAPng() {
            SanitisedImage accepted = SanitisedImage.of(image("png", 100, 80, false), ImageStore.Shape.FREE);

            assertThat(accepted.contentType()).isEqualTo("image/png");
            assertThat(accepted.extension()).isEqualTo("png");
        }

        @Test
        @DisplayName("A PNG with transparency survives as a JPEG-free PNG")
        void keepsAlphaInPng() {
            assertThat(SanitisedImage.of(image("png", 40, 40, true), ImageStore.Shape.FREE).contentType())
                    .isEqualTo("image/png");
        }

        @Test
        @DisplayName("The bytes handed out are a copy, not the record's own array")
        void doesNotLeakItsArray() {
            SanitisedImage accepted = SanitisedImage.of(image("png", 20, 20, false), ImageStore.Shape.FREE);

            byte[] first = accepted.content();
            first[0] = 0;

            assertThat(accepted.content()[0]).isNotZero();
        }
    }

    @Nested
    @DisplayName("What riding along is dropped")
    class Stripped {

        @Test
        @DisplayName("Anything appended after the image does not survive")
        void dropsATrailingPayload() {
            // The shape of every "polyglot" file: a valid image that a decoder
            // reads and a second reader finds something else in. Re-encoding is
            // what makes the question moot - the output is written from pixels.
            byte[] secret = "GPS:9.5092,-13.7122 <?php system($_GET[0]); ?>"
                    .getBytes(StandardCharsets.UTF_8);
            byte[] withPayload = concat(image("png", 60, 60, false), secret);

            byte[] published = SanitisedImage.of(withPayload, ImageStore.Shape.FREE).content();

            assertThat(new String(published, StandardCharsets.ISO_8859_1))
                    .doesNotContain("GPS:9.5092")
                    .doesNotContain("system($_GET");
        }

        @Test
        @DisplayName("The published bytes are re-encoded, not the ones sent")
        void neverPublishesTheInputVerbatim() {
            byte[] sent = concat(image("png", 60, 60, false),
                                 "trailing".getBytes(StandardCharsets.UTF_8));

            assertThat(SanitisedImage.of(sent, ImageStore.Shape.FREE).content()).isNotEqualTo(sent);
        }
    }

    @Nested
    @DisplayName("What shape it comes back")
    class Shapes {

        @Test
        @DisplayName("A logo is padded to a square, never cropped")
        void squaresALogoByPadding() throws java.io.IOException {
            // 400x160: were it cropped to a square, 60% of the mark would be
            // gone. Padding keeps every pixel and adds ground either side.
            java.awt.image.BufferedImage stored = decode(
                    SanitisedImage.of(image("png", 400, 160, false),
                                      ImageStore.Shape.SQUARE));

            assertThat(stored.getWidth()).isEqualTo(stored.getHeight());
            assertThat(stored.getWidth()).isEqualTo(400);
        }

        @Test
        @DisplayName("A logo already square is left at its own size")
        void doesNotEnlargeASquareLogo() throws java.io.IOException {
            java.awt.image.BufferedImage stored = decode(
                    SanitisedImage.of(image("png", 300, 300, false),
                                      ImageStore.Shape.SQUARE));

            assertThat(stored.getWidth()).isEqualTo(300);
            assertThat(stored.getHeight()).isEqualTo(300);
        }

        @Test
        @DisplayName("A logo larger than the square bound is brought down to it")
        void boundsALargeLogo() throws java.io.IOException {
            java.awt.image.BufferedImage stored = decode(
                    SanitisedImage.of(image("png", 2000, 2000, false),
                                      ImageStore.Shape.SQUARE));

            assertThat(stored.getWidth()).isEqualTo(SanitisedImage.SQUARE_SIDE);
            assertThat(stored.getHeight()).isEqualTo(SanitisedImage.SQUARE_SIDE);
        }

        @Test
        @DisplayName("A cover comes back in the banner proportion, whatever went in")
        void cropsACoverToTheBanner() throws java.io.IOException {
            // 16:9, which is what a telephone and a laptop both produce.
            java.awt.image.BufferedImage stored = decode(
                    SanitisedImage.of(image("jpeg", 1600, 900, false),
                                      ImageStore.Shape.BANNER));

            assertThat(ratio(stored)).isEqualTo(ratio(SanitisedImage.BANNER_WIDTH,
                                                      SanitisedImage.BANNER_HEIGHT));
        }

        @Test
        @DisplayName("A cover taller than it is wide is still a banner afterwards")
        void cropsAPortraitCover() throws java.io.IOException {
            java.awt.image.BufferedImage stored = decode(
                    SanitisedImage.of(image("jpeg", 600, 1200, false),
                                      ImageStore.Shape.BANNER));

            assertThat(ratio(stored)).isEqualTo(ratio(SanitisedImage.BANNER_WIDTH,
                                                      SanitisedImage.BANNER_HEIGHT));
        }

        @Test
        @DisplayName("A small cover is cropped, never blown up to fill the band")
        void neverEnlargesACover() throws java.io.IOException {
            java.awt.image.BufferedImage stored = decode(
                    SanitisedImage.of(image("jpeg", 800, 600, false),
                                      ImageStore.Shape.BANNER));

            // Cropping inward: the width it had, in the proportion it needed.
            assertThat(stored.getWidth()).isLessThanOrEqualTo(800);
            assertThat(ratio(stored)).isEqualTo(ratio(SanitisedImage.BANNER_WIDTH,
                                                      SanitisedImage.BANNER_HEIGHT));
        }

        @Test
        @DisplayName("A photograph of the work keeps the proportion it arrived in")
        void leavesAFreeImageAlone() throws java.io.IOException {
            java.awt.image.BufferedImage stored = decode(
                    SanitisedImage.of(image("jpeg", 1200, 900, false),
                                      ImageStore.Shape.FREE));

            assertThat(ratio(stored)).isEqualTo(ratio(4, 3));
        }

        private java.awt.image.BufferedImage decode(SanitisedImage image)
                throws java.io.IOException {
            return javax.imageio.ImageIO.read(
                    new java.io.ByteArrayInputStream(image.content()));
        }

        /** Rounded to two places: a crop of an odd number of pixels is off by one. */
        private double ratio(java.awt.image.BufferedImage image) {
            return ratio(image.getWidth(), image.getHeight());
        }

        private double ratio(int width, int height) {
            return Math.round(100.0 * width / height) / 100.0;
        }
    }

    @Nested
    @DisplayName("What is refused")
    class Refused {

        @Test
        @DisplayName("Nothing at all")
        void refusesAnEmptyBody() {
            assertThatThrownBy(() -> SanitisedImage.of(new byte[0], ImageStore.Shape.FREE))
                    .isInstanceOf(ImageRejectedException.class)
                    .hasMessageContaining("empty");
            assertThatThrownBy(() -> SanitisedImage.of(null, ImageStore.Shape.FREE))
                    .isInstanceOf(ImageRejectedException.class);
        }

        @Test
        @DisplayName("A file that is not an image, whatever it is called")
        void refusesSomethingElseEntirely() {
            // The Content-Type said image/jpeg. The bytes are the fact.
            assertThatThrownBy(() -> SanitisedImage.of(
                    "#!/bin/sh\nrm -rf /".getBytes(StandardCharsets.UTF_8), ImageStore.Shape.FREE))
                    .isInstanceOf(ImageRejectedException.class)
                    .hasMessageContaining("only JPEG and PNG");
        }

        @Test
        @DisplayName("A GIF, which is a real image and still not accepted")
        void refusesAFormatWeDoNotPublish() {
            // Every extra decoder is extra attack surface, and this market
            // produces JPEG and PNG.
            byte[] gif = "GIF89a".getBytes(StandardCharsets.US_ASCII);

            assertThatThrownBy(() -> SanitisedImage.of(gif, ImageStore.Shape.FREE))
                    .isInstanceOf(ImageRejectedException.class)
                    .hasMessageContaining("only JPEG and PNG");
        }

        @Test
        @DisplayName("The right first bytes and nothing behind them")
        void refusesAForgedHeader() {
            byte[] pretendJpeg = new byte[64];
            pretendJpeg[0] = (byte) 0xFF;
            pretendJpeg[1] = (byte) 0xD8;
            pretendJpeg[2] = (byte) 0xFF;

            assertThatThrownBy(() -> SanitisedImage.of(pretendJpeg, ImageStore.Shape.FREE))
                    .isInstanceOf(ImageRejectedException.class)
                    .hasMessageContaining("could not be read");
        }

        @Test
        @DisplayName("More than five megabytes")
        void refusesSomethingTooLarge() {
            byte[] huge = new byte[SanitisedImage.MAX_BYTES + 1];
            huge[0] = (byte) 0xFF;
            huge[1] = (byte) 0xD8;
            huge[2] = (byte) 0xFF;

            assertThatThrownBy(() -> SanitisedImage.of(huge, ImageStore.Shape.FREE))
                    .isInstanceOf(ImageRejectedException.class)
                    .hasMessageContaining("5 MB");
        }

        @Test
        @DisplayName("Dimensions are refused from the header, before anything decompresses")
        void refusesADecompressionBomb() {
            // A real image, just far too large to be a logo. What matters is
            // that the refusal comes from reading the header: a genuine bomb is
            // small on disk and enormous in memory, so a size check alone lets
            // it through and a decode alone dies on it.
            byte[] enormous = image("png", SanitisedImage.MAX_DIMENSION + 1, 4, false);

            assertThatThrownBy(() -> SanitisedImage.of(enormous, ImageStore.Shape.FREE))
                    .isInstanceOf(ImageRejectedException.class)
                    .hasMessageContaining("6000 pixels");
        }
    }
    @Nested
    @DisplayName("What is stored is not what was sent")
    class Downscaled {

        @Test
        @DisplayName("A photograph off a telephone is stored at the long edge")
        void aLargePhotographIsResized() throws Exception {
            // 3000 x 2000 is an ordinary mid-range camera. Nothing resized
            // before this, so a five-megabyte file was served as a logo to a
            // phone on 3G - which is the market, not an edge case.
            byte[] published = SanitisedImage.of(image("jpeg", 3000, 2000, false), ImageStore.Shape.FREE).content();

            java.awt.image.BufferedImage stored = javax.imageio.ImageIO.read(
                    new java.io.ByteArrayInputStream(published));

            assertThat(stored.getWidth()).isEqualTo(SanitisedImage.STORED_LONG_EDGE);
            // The ratio is kept: cropping would mean deciding what to remove
            // from somebody's photograph of their own work.
            assertThat(stored.getHeight())
                    .isEqualTo(Math.round(SanitisedImage.STORED_LONG_EDGE * 2000f / 3000f));
        }

        @Test
        @DisplayName("A small image is left alone rather than enlarged")
        void aSmallImageIsUntouched() throws Exception {
            byte[] published = SanitisedImage.of(image("png", 200, 120, false), ImageStore.Shape.FREE).content();

            java.awt.image.BufferedImage stored = javax.imageio.ImageIO.read(
                    new java.io.ByteArrayInputStream(published));

            // Enlarging costs bytes to invent detail that is not there.
            assertThat(stored.getWidth()).isEqualTo(200);
            assertThat(stored.getHeight()).isEqualTo(120);
        }

        @Test
        @DisplayName("A payload hidden in the low bits of a PNG does not survive")
        void resamplingDestroysPixelSteganography() throws Exception {
            // The one thing re-encoding alone did NOT close. PNG to PNG is
            // lossless, so a least-significant-bit payload came out the far
            // side intact; JPEG's lossy pass destroyed most of one, PNG's did
            // not touch it. Resampling rebuilds the grid from neighbours, and
            // there are no original low bits left to carry anything.
            java.awt.image.BufferedImage carrier =
                    new java.awt.image.BufferedImage(2400, 1600,
                            java.awt.image.BufferedImage.TYPE_INT_RGB);
            String secret = "BALAACA-SECRET-PAYLOAD";
            byte[] bits = secret.getBytes(StandardCharsets.US_ASCII);

            for (int y = 0; y < carrier.getHeight(); y++) {
                for (int x = 0; x < carrier.getWidth(); x++) {
                    carrier.setRGB(x, y, 0x808080);
                }
            }
            // One character per column, in the blue channel's low bit.
            for (int i = 0; i < bits.length * 8; i++) {
                int bit = (bits[i / 8] >> (7 - (i % 8))) & 1;
                int rgb = (carrier.getRGB(i, 0) & 0xFFFFFFFE) | bit;
                carrier.setRGB(i, 0, rgb);
            }

            java.io.ByteArrayOutputStream raw = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(carrier, "png", raw);

            java.awt.image.BufferedImage stored = javax.imageio.ImageIO.read(
                    new java.io.ByteArrayInputStream(
                            SanitisedImage.of(raw.toByteArray(), ImageStore.Shape.FREE).content()));

            StringBuilder recovered = new StringBuilder();
            for (int i = 0; i < bits.length * 8; i += 8) {
                int value = 0;
                for (int b = 0; b < 8; b++) {
                    int x = Math.min(i + b, stored.getWidth() - 1);
                    value = (value << 1) | (stored.getRGB(x, 0) & 1);
                }
                recovered.append((char) value);
            }

            assertThat(recovered.toString()).doesNotContain(secret);
        }
    }

}
