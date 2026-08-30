package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;

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
 * The page a provider edits, and the gate in front of publishing it.
 *
 * <p>The journey test is the important one: register, fail to publish, add what
 * is missing, publish, and find the page on the public path. That is the whole
 * arc a real salon walks, and until it passed nobody had ever walked it.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class ProviderProfileIT {

    private static final String PROFILE = "/v1/provider-profile";
    private static final String[] SCOPES =
            {"dashboard:read", "profile:write", "catalog:write", "schedule:write"};

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String profile(String name, boolean published) {
        return """
               {"business_name":"%s","timezone":"Africa/Conakry","published":%s}
               """.formatted(name, published);
    }

    private static io.restassured.response.Response put(String body) {
        return given().contentType("application/json").body(body).when().put(PROFILE);
    }

    @Test
    @DisplayName("A provider reads their own page")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void readsTheOwnProfile() {
        given().when().get(PROFILE).then().statusCode(200)
                .body("slug", equalTo("salon-fatou"))
                .body("business_name", equalTo("Salon Fatou"))
                .body("whatsapp_phone_e164", equalTo("+224622999001"))
                .body("published", is(true))
                .body("status", equalTo("ACTIVE"));
    }

    @Test
    @DisplayName("Reading someone else's page is not possible: there is no way to ask")
    @TestSecurity(user = BookingFixtures.STRANGER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.STRANGER_SUBJECT))
    void refusesASubjectWithNoMembership() {
        given().when().get(PROFILE).then().statusCode(403).body("code", equalTo("FORBIDDEN"));
    }

    @Test
    @DisplayName("An edit replaces the whole page, and leaves the handle alone")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void replacesTheWholeProfile() {
        put("""
            {"business_name":"Salon Fatou & Filles","description":"Tresses et soins",
             "city":"Kaloum","address_line":"Avenue de la Republique",
             "timezone":"Africa/Conakry","published":true}
            """).then().statusCode(200)
                .body("business_name", equalTo("Salon Fatou & Filles"))
                .body("city", equalTo("Kaloum"))
                // Not in the request body and unchanged: it is on the QR code.
                .body("slug", equalTo("salon-fatou"))
                // Not the caller's to set either.
                .body("status", equalTo("ACTIVE"));

        // Whatsapp was in the row and not in the request, so it is gone. A
        // replace that quietly kept it would make "the whole page" a lie.
        given().when().get(PROFILE).then().statusCode(200)
                .body("whatsapp_phone_e164", org.hamcrest.Matchers.nullValue());
    }

    @Test
    @DisplayName("A category that is not offered is refused on an edit too")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesAnUnknownCategoryOnEdit() {
        put("""
            {"business_name":"Salon Fatou","category_slug":"plomberie",
             "timezone":"Africa/Conakry","published":true}
            """).then().statusCode(400).body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("Unpublishing needs nothing: a provider may always close the door")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void allowsUnpublishingUnconditionally() {
        put(profile("Salon Fatou", false)).then().statusCode(200).body("published", is(false));

        given().when().get("/v1/providers/salon-fatou").then().statusCode(404);
    }

    @Test
    @DisplayName("Register, fail to publish twice, then walk onto the public path")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = {
            "dashboard:read", "profile:write", "catalog:write", "schedule:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void walksTheWholeOnboardingJourney() {
        given().contentType("application/json")
                .body("""
                      {"slug":"salon-awa","business_name":"Salon Awa","city":"Conakry"}
                      """)
                .when().post("/v1/providers").then().statusCode(201);

        // Nothing to book at all.
        put(profile("Salon Awa", true)).then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        given().contentType("application/json")
                .body("""
                      {"name":"Tresses","duration_minutes":60,
                       "price":{"amount_minor":150000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(201);

        // A service and no hours is still a page with an empty calendar.
        put(profile("Salon Awa", true)).then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        String staffId = given().when().get("/v1/staff").then().statusCode(200)
                .extract().jsonPath().getString("data[0].staff_id");

        given().contentType("application/json")
                .body("""
                      {"staff_id":"%s","data":[
                        {"day_of_week":2,"start_time":"09:00","end_time":"18:00"}]}
                      """.formatted(staffId))
                .when().put("/v1/opening-hours").then().statusCode(200);

        put(profile("Salon Awa", true)).then().statusCode(200).body("published", is(true));

        // And the page a customer reaches now exists.
        given().when().get("/v1/providers/salon-awa").then().statusCode(200)
                .body("business_name", equalTo("Salon Awa"))
                .body("services[0].name", equalTo("Tresses"));
    }
}
