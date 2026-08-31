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
            SanitisedImage accepted = SanitisedImage.of(image("jpeg", 100, 80, false));

            assertThat(accepted.contentType()).isEqualTo("image/jpeg");
            assertThat(accepted.extension()).isEqualTo("jpg");
            assertThat(accepted.content()).isNotEmpty();
        }

        @Test
        @DisplayName("A PNG comes back a PNG")
        void acceptsAPng() {
            SanitisedImage accepted = SanitisedImage.of(image("png", 100, 80, false));

            assertThat(accepted.contentType()).isEqualTo("image/png");
            assertThat(accepted.extension()).isEqualTo("png");
        }

        @Test
        @DisplayName("A PNG with transparency survives as a JPEG-free PNG")
        void keepsAlphaInPng() {
            assertThat(SanitisedImage.of(image("png", 40, 40, true)).contentType())
                    .isEqualTo("image/png");
        }

        @Test
        @DisplayName("The bytes handed out are a copy, not the record's own array")
        void doesNotLeakItsArray() {
            SanitisedImage accepted = SanitisedImage.of(image("png", 20, 20, false));

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

            byte[] published = SanitisedImage.of(withPayload).content();

            assertThat(new String(published, StandardCharsets.ISO_8859_1))
                    .doesNotContain("GPS:9.5092")
                    .doesNotContain("system($_GET");
        }

        @Test
        @DisplayName("The published bytes are re-encoded, not the ones sent")
        void neverPublishesTheInputVerbatim() {
            byte[] sent = concat(image("png", 60, 60, false),
                                 "trailing".getBytes(StandardCharsets.UTF_8));

            assertThat(SanitisedImage.of(sent).content()).isNotEqualTo(sent);
        }
    }

    @Nested
    @DisplayName("What is refused")
    class Refused {

        @Test
        @DisplayName("Nothing at all")
        void refusesAnEmptyBody() {
            assertThatThrownBy(() -> SanitisedImage.of(new byte[0]))
                    .isInstanceOf(ImageRejectedException.class)
                    .hasMessageContaining("empty");
            assertThatThrownBy(() -> SanitisedImage.of(null))
                    .isInstanceOf(ImageRejectedException.class);
        }

        @Test
        @DisplayName("A file that is not an image, whatever it is called")
        void refusesSomethingElseEntirely() {
            // The Content-Type said image/jpeg. The bytes are the fact.
            assertThatThrownBy(() -> SanitisedImage.of(
                    "#!/bin/sh\nrm -rf /".getBytes(StandardCharsets.UTF_8)))
                    .isInstanceOf(ImageRejectedException.class)
                    .hasMessageContaining("only JPEG and PNG");
        }

        @Test
        @DisplayName("A GIF, which is a real image and still not accepted")
        void refusesAFormatWeDoNotPublish() {
            // Every extra decoder is extra attack surface, and this market
            // produces JPEG and PNG.
            byte[] gif = "GIF89a".getBytes(StandardCharsets.US_ASCII);

            assertThatThrownBy(() -> SanitisedImage.of(gif))
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

            assertThatThrownBy(() -> SanitisedImage.of(pretendJpeg))
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

            assertThatThrownBy(() -> SanitisedImage.of(huge))
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

            assertThatThrownBy(() -> SanitisedImage.of(enormous))
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
            byte[] published = SanitisedImage.of(image("jpeg", 3000, 2000, false)).content();

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
            byte[] published = SanitisedImage.of(image("png", 200, 120, false)).content();

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
                            SanitisedImage.of(raw.toByteArray()).content()));

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
