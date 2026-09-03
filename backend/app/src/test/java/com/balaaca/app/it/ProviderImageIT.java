package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A provider's logo and cover, end to end.
 *
 * <p>Both columns existed from V004 and nothing ever wrote to them, so the page
 * a customer sees had no picture on it and no way to get one.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class ProviderImageIT {

    private static final String LOGO = "/v1/provider-profile/logo";
    private static final String COVER = "/v1/provider-profile/cover";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        fixtures.seedEmployee();
    }

    private static byte[] png(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        var g = image.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, width, height);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    @Test
    @DisplayName("An owner uploads a logo and it appears on the public page")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void uploadsALogo() {
        String url = given().contentType("image/png").body(png(64, 64))
                .when().post(LOGO).then().statusCode(200)
                .body("logo_url", matchesPattern("^/v1/media/[A-Za-z0-9_-]{22}\\.png$"))
                .extract().jsonPath().getString("logo_url");

        // Public, because the page that shows it is.
        given().when().get(url).then().statusCode(200)
                .contentType("image/png")
                .header("Cache-Control", equalTo("public, max-age=31536000, immutable"));

        given().when().get("/v1/providers/salon-fatou").then().statusCode(200)
                .body("logo_url", equalTo(url));
    }

    @Test
    @DisplayName("The cover is a separate slot, not the same one")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void keepsLogoAndCoverApart() {
        given().contentType("image/png").body(png(64, 64)).when().post(LOGO)
                .then().statusCode(200);
        String cover = given().contentType("image/jpeg").body(png(200, 80))
                .when().post(COVER).then().statusCode(200)
                .extract().jsonPath().getString("cover_url");

        given().when().get("/v1/provider-profile").then().statusCode(200)
                .body("logo_url", org.hamcrest.Matchers.notNullValue())
                .body("cover_url", equalTo(cover))
                .body("logo_url", org.hamcrest.Matchers.not(equalTo(cover)));
    }

    @Test
    @DisplayName("Replacing one drops the file it replaced")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void dropsThePreviousFile() {
        String first = given().contentType("image/png").body(png(64, 64))
                .when().post(LOGO).then().statusCode(200)
                .extract().jsonPath().getString("logo_url");

        String second = given().contentType("image/png").body(png(80, 80))
                .when().post(LOGO).then().statusCode(200)
                .extract().jsonPath().getString("logo_url");

        assertThat(second).isNotEqualTo(first);
        given().when().get(second).then().statusCode(200);
        // Not merely unreferenced: gone, so a URL someone copied stops working
        // when the provider takes the picture down.
        given().when().get(first).then().statusCode(404);
    }

    @Test
    @DisplayName("Anything riding along in the file does not reach the page")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void publishesOnlyPixels() {
        byte[] image = png(64, 64);
        byte[] withPayload = new byte[image.length + 40];
        System.arraycopy(image, 0, withPayload, 0, image.length);
        System.arraycopy("GPS:9.5092,-13.7122".getBytes(StandardCharsets.UTF_8), 0,
                         withPayload, image.length, 19);

        String url = given().contentType("image/png").body(withPayload)
                .when().post(LOGO).then().statusCode(200)
                .extract().jsonPath().getString("logo_url");

        byte[] served = given().when().get(url).then().statusCode(200)
                .extract().body().asByteArray();

        // A phone writes its GPS coordinates into a photo without being asked,
        // and a salon would otherwise publish them on its own page.
        assertThat(new String(served, StandardCharsets.ISO_8859_1))
                .doesNotContain("GPS:9.5092");
    }

    @Test
    @DisplayName("A file that is not an image is refused, whatever it claims")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesSomethingElse() {
        given().contentType("image/png").body("#!/bin/sh\nrm -rf /".getBytes(StandardCharsets.UTF_8))
                .when().post(LOGO).then().statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("An employee cannot change the shopfront's picture")
    @TestSecurity(user = BookingFixtures.EMPLOYEE_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.EMPLOYEE_SUBJECT))
    void refusesANonOwner() {
        given().contentType("image/png").body(png(64, 64))
                .when().post(LOGO).then().statusCode(403);
    }

    @Test
    @DisplayName("A name nobody minted is a 404")
    void refusesAnUnknownName() {
        given().when().get("/v1/media/AAAAAAAAAAAAAAAAAAAAAA.png").then().statusCode(404);
    }

    @Test
    @DisplayName("A traversal never reaches the disk at all")
    void refusesATraversal() {
        // Refused by the contract's own pattern, before any code runs. The store
        // re-checks the resolved parent anyway, because a traversal that gets
        // past a regex must not get past "is it still in the directory I meant"
        // - but the first line of defence is that this is not a valid name.
        given().when().get("/v1/media/..%2F..%2Fetc%2Fpasswd.png").then().statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A provider with no picture says so rather than pointing at nothing")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void omitsTheUrlWhenThereIsNoImage() {
        given().when().get("/v1/provider-profile").then().statusCode(200)
                .body("logo_url", nullValue())
                .body("cover_url", nullValue());
    }
}
