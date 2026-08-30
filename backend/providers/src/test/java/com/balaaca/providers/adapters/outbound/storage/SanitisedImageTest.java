package com.balaaca.providers.adapters.outbound.storage;

import com.balaaca.providers.domain.ImageRejectedException;

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
}
