package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import io.restassured.path.json.JsonPath;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Seeing your own page before anybody else can.
 *
 * <p>`/v1/providers/&#123;slug&#125;` resolves through a published-only lookup,
 * so until a business publishes there is nothing there to look at. Four
 * dashboard screens linked to it anyway, which was four buttons opening a 404
 * on the provider's own dashboard, and the worst of them was a "Prévisualiser"
 * sitting on a card that only renders WHILE the page is unpublished.
 *
 * <p>The property worth testing is not that the route answers. It is that it
 * answers with the SAME thing the public route does, because the alternative
 * design - assembling a preview out of the dashboard's own endpoints - is two
 * sources of truth for one page, and the two would disagree on the first change
 * either side. So the test publishes, compares the two answers field by field,
 * unpublishes, and asks again.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class PagePreviewIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("The preview is the page, field for field, while the page exists")
    void thePreviewIsThePage() {
        JsonPath preview = given().when().get("/v1/provider-profile/preview")
                .then().statusCode(200).extract().jsonPath();
        JsonPath page = given().when().get("/v1/providers/salon-fatou")
                .then().statusCode(200).extract().jsonPath();

        // Not a spot check on two fields: the whole projection, compared as one
        // value. A field added to the page and forgotten in the preview is
        // exactly the drift this route was built to make impossible, so the
        // test has to notice it without being edited.
        org.junit.jupiter.api.Assertions.assertEquals(
                page.getMap("$"), preview.getMap("provider"),
                "the preview must be the public projection, not a second one");

        JsonPath hours = given().when().get("/v1/providers/salon-fatou/opening-hours")
                .then().statusCode(200).extract().jsonPath();
        org.junit.jupiter.api.Assertions.assertEquals(
                hours.getMap("$"), preview.getMap("opening_hours"));

        JsonPath staff = given().when().get("/v1/providers/salon-fatou/staff")
                .then().statusCode(200).extract().jsonPath();
        org.junit.jupiter.api.Assertions.assertEquals(
                staff.getMap("$"), preview.getMap("staff"));

        given().when().get("/v1/provider-profile/preview").then()
                .body("published", equalTo(true))
                .body("provider.services.size()", greaterThan(0));
    }

    @Test
    @DisplayName("It answers for a business that has not published, which is the whole point")
    void anUnpublishedPageIsStillLookedAt() {
        fixtures.execute("UPDATE providers SET published = false WHERE slug = 'salon-fatou'");

        // The public route is gone, deliberately and identically to an unknown
        // handle.
        given().when().get("/v1/providers/salon-fatou").then().statusCode(404);

        given().when().get("/v1/provider-profile/preview").then().statusCode(200)
                .body("published", equalTo(false))
                .body("provider.slug", equalTo("salon-fatou"))
                .body("provider.business_name", notNullValue())
                .body("provider.services", hasSize(greaterThan(0)))
                .body("opening_hours.timezone", notNullValue());
    }

    @Test
    @DisplayName("It is the caller's own page and no argument can point it elsewhere")
    void itTakesNoIdentifier() {
        // No slug, no provider id, no query parameter: the tenant comes from the
        // token through the database, so there is nothing here to point at
        // somebody else's unpublished page - which is what a preview that took
        // a slug would have been.
        given().when().get("/v1/provider-profile/preview").then().statusCode(200)
                .body("provider.slug", equalTo("salon-fatou"));

        given().when().get("/v1/provider-profile/preview?slug=coiffeur-solo")
                .then().statusCode(200)
                .body("provider.slug", equalTo("salon-fatou"));
    }

    @Test
    @DisplayName("Somebody who runs no business previews nothing")
    @TestSecurity(user = BookingFixtures.STRANGER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.STRANGER_SUBJECT))
    void aStrangerHasNoPage() {
        given().when().get("/v1/provider-profile/preview").then().statusCode(403);
    }
}
