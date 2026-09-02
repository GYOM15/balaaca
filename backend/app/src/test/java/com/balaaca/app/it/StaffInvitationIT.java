package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

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
 * Letting an employee sign in.
 *
 * <p>V015 drew a line between OWNER and STAFF and nine tests hold it, and until
 * this existed the STAFF side of that line was unreachable in production:
 * {@code provider_staff.user_id} was written by exactly one thing, registration,
 * for the owner. No employee had ever had an account outside a test fixture.
 *
 * <p>That was the third time this shape appeared - machinery built, tested, and
 * unreachable because nothing created the row it needed.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class StaffInvitationIT {

    private static final String TEAM = "/v1/staff";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    /** Adds a chair as the owner and mints a code for it. */
    private static String inviteANewChair(String name) {
        String id = given().contentType("application/json")
                .body("{\"display_name\":\"" + name + "\",\"bookable\":true,\"active\":true}")
                .when().post(TEAM).then().statusCode(201)
                .extract().jsonPath().getString("staff_id");

        return given().when().post(TEAM + "/" + id + "/invitation")
                .then().statusCode(201)
                .extract().jsonPath().getString("code");
    }

    @Test
    @DisplayName("An owner mints a code, and the person who redeems it can sign in")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void mintsACode() {
        String code = inviteANewChair("Mariama");

        // Three initials, a hyphen, eight characters of the thirty-one a person
        // does not mishear. Asserted as a SHAPE and not a length: the point of
        // V045 is that the owner can say this down a telephone, and a bare
        // hasSize() would still pass for 43 characters of base64url.
        assertThat(code).isNotBlank()
                .matches("^[A-Z0-9]{3}-[2-9A-HJKMNP-Z]{8}$");
        // SALON is "Salon Fatou" in the fixtures.
        assertThat(code).startsWith("SFA-");
    }

    @Test
    @DisplayName("The code is 256 bits and nothing else: it is the whole authorisation")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void mintsADifferentCodeEachTime() {
        assertThat(inviteANewChair("Mariama")).isNotEqualTo(inviteANewChair("Aissatou"));
    }

    @Test
    @DisplayName("The owner cannot invite themselves")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesToInviteTheOwner() {
        // An owner's row is not claimable by an invitation, in the function and
        // in the policy behind it - so a code for one would be a code that can
        // never be redeemed.
        String owner = given().when().get(TEAM).then().statusCode(200)
                .extract().jsonPath().getString("data.find { it.role == 'OWNER' }.staff_id");

        given().when().post(TEAM + "/" + owner + "/invitation")
                .then().statusCode(409).body("code", equalTo("INVALID_STATE_TRANSITION"));
    }

    @Test
    @DisplayName("A member who is not there is a 404, not a 409")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void separatesAbsentFromUninvitable() {
        given().when().post(TEAM + "/a9a9a9a9-0000-0000-0000-000000000009/invitation")
                .then().statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("An employee cannot invite anybody")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesANonOwner() {
        fixtures.seedEmployee();

        given().when().post(TEAM + "/" + BookingFixtures.SALON_EMPLOYEE_STAFF + "/invitation")
                .then().statusCode(409);
    }

    private static final String CODE = "un-code-de-test-suffisamment-long-1234";

    @Test
    @DisplayName("A stranger redeems a code and becomes staff who can sign in")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = {
            "dashboard:read", "profile:write", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void redeemsACodeAndJoins() {
        fixtures.seedInvitation(CODE);

        // Before: a valid token belonging to nobody here.
        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(403);

        given().when().post("/v1/invitations/" + CODE + "/acceptance")
                .then().statusCode(200)
                .body("provider_slug", equalTo("salon-fatou"))
                .body("business_name", equalTo("Salon Fatou"))
                // The name the OWNER wrote on the chair, not one the caller
                // chose: they were invited to a seat that already existed.
                .body("display_name", equalTo("Mariama"))
                .body("role", equalTo("STAFF"));

        // After: the same token, the same request, a different answer.
        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200);
        given().when().get(TEAM).then().statusCode(200).body("data", hasSize(2));
    }

    @Test
    @DisplayName("Joining makes you staff, not an owner")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = {
            "dashboard:read", "profile:write", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void joinsAsStaffAndNotAsOwner() {
        fixtures.seedInvitation(CODE);
        given().when().post("/v1/invitations/" + CODE + "/acceptance").then().statusCode(200);

        // The token carries profile:write. The refusal comes from the database's
        // answer about who this person is.
        given().contentType("application/json")
                .body("""
                      {"business_name":"Detourne","timezone":"Africa/Conakry",
                       "published":false}
                      """)
                .when().put("/v1/provider-profile").then().statusCode(403);
    }

    @Test
    @DisplayName("A code is spent by the first person to redeem it")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void spendsTheCodeOnce() {
        fixtures.seedInvitation(CODE);

        given().when().post("/v1/invitations/" + CODE + "/acceptance").then().statusCode(200);
        // Spent in the same statement that claimed it, so two people reading the
        // same message cannot both take the seat.
        given().when().post("/v1/invitations/" + CODE + "/acceptance").then().statusCode(404);
    }

    @Test
    @DisplayName("Someone who already runs a business cannot take a seat elsewhere")
    @TestSecurity(user = BookingFixtures.SOLO_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SOLO_SUBJECT))
    void refusesAnAccountThatBelongsSomewhere() {
        fixtures.seedInvitation(CODE);

        given().when().post("/v1/invitations/" + CODE + "/acceptance")
                .then().statusCode(409).body("code", equalTo("ALREADY_REGISTERED"));
    }

    @Test
    @DisplayName("An expired code is the same 404 as one that never existed")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void refusesAnExpiredCode() {
        fixtures.seedInvitation(CODE);
        fixtures.execute("UPDATE provider_staff SET invitation_expires_at = now() - interval '1 day'"
                         + " WHERE invitation_token = '" + CODE + "'");

        given().when().post("/v1/invitations/" + CODE + "/acceptance").then().statusCode(404);
    }

    @Test
    @DisplayName("A code nobody minted is a 404")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void refusesAnUnknownCode() {
        given().when().post("/v1/invitations/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/acceptance")
                .then().statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }
}
