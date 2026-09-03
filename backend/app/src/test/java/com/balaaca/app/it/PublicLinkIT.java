package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.startsWith;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The link a salon puts in a WhatsApp status, and the square it prints.
 *
 * <p>A provider had no way to learn its own public address from the product:
 * the slug was in the profile and where that slug lives was a deployment fact
 * nobody exposed. So the link was assembled by hand, which is how a card gets
 * printed with a double slash in it.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class PublicLinkIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("The profile carries the address customers reach it at")
    void theLinkIsPublished() {
        given().when().get("/v1/provider-profile").then().statusCode(200)
                .body("public_url", endsWithPath("/p/salon-fatou"));
    }

    @Test
    @DisplayName("The code is a vector, because a provider prints it")
    void theCodeIsAnSvg() {
        String svg = given().when().get("/v1/provider-profile/qr-code").then()
                .statusCode(200)
                .header("Content-Type", containsString("image/svg+xml"))
                // A day. It changes only if the slug changes, and the slug
                // cannot - it is on every card already handed out.
                .header("Cache-Control", equalTo("private, max-age=86400"))
                .extract().asString();

        org.assertj.core.api.Assertions.assertThat(svg)
                .startsWith("<svg").endsWith("</svg>")
                // A white ground explicitly: transparent inverts on a dark page
                // and stops scanning, which is exactly where a provider tries it.
                .contains("fill=\"#ffffff\"")
                // One path rather than a thousand rects.
                .containsOnlyOnce("<path");
    }

    @Test
    @DisplayName("A stranger cannot read another salon's code")
    @TestSecurity(user = BookingFixtures.STRANGER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.STRANGER_SUBJECT))
    void theCodeIsBoundToTheCaller() {
        // No slug is accepted anywhere on this route: the business comes from
        // the token, so there is nothing to enumerate.
        given().when().get("/v1/provider-profile/qr-code").then().statusCode(403);
    }

    private static org.hamcrest.Matcher<String> endsWithPath(String suffix) {
        return org.hamcrest.Matchers.allOf(startsWith("http"),
                                           org.hamcrest.Matchers.endsWith(suffix));
    }
}
