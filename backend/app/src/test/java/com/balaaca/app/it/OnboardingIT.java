package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

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
 * Signing up, and the thing it unlocks.
 *
 * <p>Before this existed a salon could create a Keycloak account, hold a
 * perfectly valid token, and be answered 403 by every route on the platform
 * forever, because nothing wrote the {@code users} and {@code provider_staff}
 * rows the tenant is resolved from. The headline test here is not that a row
 * appears - it is that the agenda answers 200 to a subject it refused a moment
 * earlier.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class OnboardingIT {

    private static final String REGISTER = "/v1/providers";
    private static final String PROFILE = "/v1/provider-profile";
    private static final String AGENDA = "/v1/appointments";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static io.restassured.response.Response register(String body) {
        return given().contentType("application/json").body(body).when().post(REGISTER);
    }

    @Test
    @DisplayName("Registering is authenticated: an anonymous caller creates nothing")
    void refusesAnAnonymousCaller() {
        register("""
                {"slug":"salon-anonyme","business_name":"Anonyme"}
                """).then().statusCode(401);
    }

    @Test
    @DisplayName("A brand new account registers, and the agenda opens to it")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT,
                  roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = {
            @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT),
            @Claim(key = "name", value = "Awa Diallo"),
            @Claim(key = "email", value = "awa@example.com")})
    void registersAndUnlocksTheAuthenticatedSurface() {
        // Refused before, on the very same token.
        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get(AGENDA).then().statusCode(403);

        register("""
                {"slug":"salon-awa","business_name":"Salon Awa",
                 "category_slug":"coiffure","city":"Conakry"}
                """).then().statusCode(201)
                .body("provider_id", notNullValue())
                .body("slug", equalTo("salon-awa"))
                .body("published", is(false));

        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get(AGENDA).then().statusCode(200);

        given().when().get(PROFILE).then().statusCode(200)
                .body("slug", equalTo("salon-awa"))
                .body("business_name", equalTo("Salon Awa"))
                .body("category_slug", equalTo("coiffure"))
                .body("status", equalTo("PENDING"))
                .body("published", is(false))
                // Defaulted, not assumed, and not sent by the client.
                .body("timezone", equalTo("Africa/Conakry"));
    }

    @Test
    @DisplayName("A business is born dormant: its page is not on the public path")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void createsTheBusinessUnpublished() {
        register("""
                {"slug":"salon-awa","business_name":"Salon Awa"}
                """).then().statusCode(201);

        // The same 404 an unknown handle gets. Registering does not publish.
        given().when().get("/v1/providers/salon-awa").then().statusCode(404);
    }

    @Test
    @DisplayName("One account, one business")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void refusesASecondBusinessForTheSameAccount() {
        register("""
                {"slug":"salon-awa","business_name":"Salon Awa"}
                """).then().statusCode(201);

        register("""
                {"slug":"salon-awa-deux","business_name":"Salon Awa 2"}
                """).then().statusCode(409).body("code", equalTo("ALREADY_REGISTERED"));
    }

    @Test
    @DisplayName("An account that exists but runs nothing can still register")
    @TestSecurity(user = BookingFixtures.STRANGER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.STRANGER_SUBJECT))
    void reusesAnExistingAccountRatherThanRefusingIt() {
        // This subject already has a users row and no membership. A signup that
        // insisted on creating the account would collide with itself here.
        register("""
                {"slug":"salon-personne","business_name":"Salon Personne"}
                """).then().statusCode(201);
    }

    @Test
    @DisplayName("A handle another business holds is refused, and says which problem it is")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void refusesATakenHandle() {
        // Not ALREADY_REGISTERED: one is fixed by choosing another handle and
        // the other is not fixed by anything the caller can type.
        register("""
                {"slug":"salon-fatou","business_name":"Salon Awa"}
                """).then().statusCode(409).body("code", equalTo("SLUG_UNAVAILABLE"));
    }

    @Test
    @DisplayName("An unpublished business's handle is taken too")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void refusesAHandleHeldByAnUnpublishedBusiness() {
        // barbier-cache is invisible on the public path and still owns its
        // handle: a slug freed by unpublishing would let someone take over the
        // QR codes of a salon that is merely closed for the season.
        register("""
                {"slug":"barbier-cache","business_name":"Salon Awa"}
                """).then().statusCode(409).body("code", equalTo("SLUG_UNAVAILABLE"));
    }

    @Test
    @DisplayName("A category that does not exist is refused, not silently dropped")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void refusesAnUnknownCategory() {
        register("""
                {"slug":"salon-awa","business_name":"Salon Awa","category_slug":"plomberie"}
                """).then().statusCode(400).body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A category no longer offered is unknown")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void refusesARetiredCategory() {
        register("""
                {"slug":"salon-awa","business_name":"Salon Awa","category_slug":"retire"}
                """).then().statusCode(400).body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A timezone nobody has heard of is refused at the edge")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void refusesAnUnknownTimezone() {
        // Stored, it would be discovered by a reminder firing at the wrong hour.
        register("""
                {"slug":"salon-awa","business_name":"Salon Awa","timezone":"Africa/Nulle-Part"}
                """).then().statusCode(400).body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A handle that is not a handle never reaches the database")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void refusesAMalformedHandle() {
        register("""
                {"slug":"Salon Awa!","business_name":"Salon Awa"}
                """).then().statusCode(400).body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A token with no name claim still registers, under its subject")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void doesNotRequireANameClaim() {
        // A display name is a label. Refusing a signup over one would make the
        // platform unusable for any realm that does not populate the claim.
        register("""
                {"slug":"salon-awa","business_name":"Salon Awa"}
                """).then().statusCode(201);

        given().when().get("/v1/staff").then().statusCode(200)
                .body("data[0].display_name", equalTo(BookingFixtures.NEWCOMER_SUBJECT))
                .body("data[0].role", equalTo("OWNER"));
    }

    @Test
    @DisplayName("The optional fields are optional")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void registersWithNothingButAHandleAndAName() {
        register("""
                {"slug":"salon-awa","business_name":"Salon Awa"}
                """).then().statusCode(201);

        given().when().get(PROFILE).then().statusCode(200)
                .body("category_slug", nullValue())
                .body("city", nullValue());
    }
}
