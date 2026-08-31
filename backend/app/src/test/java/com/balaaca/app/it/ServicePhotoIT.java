package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What a service looks like.
 *
 * <p>A customer choosing between "Tresses collees - 150 000" and "Tresses
 * torsades - 200 000" cannot tell the difference from the words. In these
 * trades the photograph IS the specification, and the text is a label on it.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "catalog:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class ServicePhotoIT {

    private static final String PHOTOS =
            "/v1/service-offerings/" + BookingFixtures.SALON_OFFERING + "/photos";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static byte[] photo(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "jpeg", out);
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
        return out.toByteArray();
    }

    private static io.restassured.response.ValidatableResponse add() {
        return given().contentType("image/jpeg").body(photo(400, 300))
                .when().post(PHOTOS).then();
    }

    @Test
    @DisplayName("A service carries its own photographs, in the provider's order")
    void aServiceShowsItself() {
        add().statusCode(201).body("data", hasSize(1))
                .body("data[0].position", equalTo(0))
                // A name minted by the store: not the provider, not the kind,
                // not the original filename.
                .body("data[0].url", startsWith("/v1/media/"));

        add().statusCode(201).body("data", hasSize(2))
                .body("data[1].position", equalTo(1));

        given().when().get(PHOTOS).then().statusCode(200).body("data", hasSize(2));
    }

    @Test
    @DisplayName("Five, and the sixth is refused with a sentence")
    void theCapIsAPromiseAboutThePage() {
        for (int i = 0; i < 5; i++) {
            add().statusCode(201);
        }
        add().statusCode(422).body("code", equalTo("VALIDATION_FAILED"));

        given().when().get(PHOTOS).then().statusCode(200).body("data", hasSize(5));
    }

    @Test
    @DisplayName("Removing one does not renumber the others")
    void thePositionsHold() {
        add().statusCode(201);
        String second = add().statusCode(201).extract().path("data[1].photo_id");
        add().statusCode(201);

        given().when().delete(PHOTOS + "/" + second).then().statusCode(200)
                .body("data", hasSize(2))
                // Still 0 and 2. Renumbering would move the first photograph,
                // which is the one that represents the service in a list - a
                // provider who chose it would find it changed because they
                // deleted something else.
                .body("data[0].position", equalTo(0))
                .body("data[1].position", equalTo(2));
    }

    @Test
    @DisplayName("A freed slot is taken by the next upload")
    void theHoleIsReused() {
        String first = add().statusCode(201).extract().path("data[0].photo_id");
        add().statusCode(201);

        given().when().delete(PHOTOS + "/" + first).then().statusCode(200);
        add().statusCode(201).body("data[0].position", equalTo(0));
    }

    @Test
    @DisplayName("A customer sees them on the page, without signing in")
    void theyReachThePublicPage() {
        add().statusCode(201);

        given().when().get("/v1/providers/salon-fatou").then().statusCode(200)
                .body("services.find { it.name == 'Tresses' }.photos", hasSize(1));
    }

    @Test
    @DisplayName("Another salon's service has no photographs to add to")
    void theServiceIsOnesOwn() {
        given().contentType("image/jpeg").body(photo(400, 300))
                .when().post("/v1/service-offerings/"
                             + BookingFixtures.HIDDEN_OFFERING + "/photos")
                .then().statusCode(404);
    }

    @Test
    @DisplayName("What is stored is scaled down, whatever was sent")
    void nothingArrivesAtFullSize() {
        // 3000 pixels in, 1600 out. Nothing resized before this, so a five
        // megabyte photograph was served to a telephone on 3G as-is.
        String url = given().contentType("image/jpeg").body(photo(3000, 2000))
                .when().post(PHOTOS).then().statusCode(201)
                .extract().path("data[0].url");

        byte[] served = given().when().get(url).then().statusCode(200)
                .extract().asByteArray();

        try {
            var stored = ImageIO.read(new java.io.ByteArrayInputStream(served));
            org.assertj.core.api.Assertions.assertThat(stored.getWidth()).isEqualTo(1600);
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
