package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A salon with more than one chair.
 *
 * <p>Everything that resolves "any available staff", retries across candidates
 * and keys the exclusion constraint on a person was already built and was
 * unreachable in production: registration writes one OWNER row and nothing could
 * write a second. A salon with three braiders could not exist.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class TeamIT {

    private static final String TEAM = "/v1/staff";
    private static final String PUBLIC_TEAM = "/v1/providers/salon-fatou/staff";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String member(String name, boolean bookable, boolean active) {
        return """
               {"display_name":"%s","bookable":%s,"active":%s}
               """.formatted(name, bookable, active);
    }

    private static String add(String body) {
        return given().contentType("application/json").body(body)
                .when().post(TEAM).then().statusCode(201)
                .extract().jsonPath().getString("staff_id");
    }

    private static List<String> team() {
        return given().when().get(TEAM).then().statusCode(200)
                .extract().jsonPath().getList("data.display_name", String.class);
    }

    @Test
    @DisplayName("A salon adds a second braider, and she is bookable at once")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void addsAMember() {
        add(member("Mariama", true, true));

        assertThat(team()).containsExactly("Fatou", "Mariama");

        given().when().get(PUBLIC_TEAM).then().statusCode(200)
                .body("data", hasSize(2))
                .body("data.display_name", org.hamcrest.Matchers.hasItem("Mariama"));
    }

    @Test
    @DisplayName("A member is a chair, not an account")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void addsSeveralMembersWithNoAccounts() {
        // One active membership per account is a unique index. If a member
        // carried the owner's user_id, the second insert would be refused and a
        // salon could never have three people.
        add(member("Mariama", true, true));
        add(member("Aissatou", true, true));

        assertThat(team()).containsExactly("Aissatou", "Fatou", "Mariama");
    }

    @Test
    @DisplayName("Everyone added is staff; the owner stays the one registration wrote")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void neverCreatesASecondOwner() {
        add(member("Mariama", true, true));

        var roles = given().when().get(TEAM).then().statusCode(200)
                .extract().jsonPath().getList("data.role", String.class);
        assertThat(roles).containsExactlyInAnyOrder("OWNER", "STAFF");
    }

    @Test
    @DisplayName("A receptionist is on the team and not on the public list")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void hidesSomeoneWhoIsNotBookable() {
        add(member("Kadiatou", false, true));

        assertThat(team()).contains("Kadiatou");
        given().when().get(PUBLIC_TEAM).then().statusCode(200)
                .body("data.display_name", org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.hasItem("Kadiatou")));
    }

    @Test
    @DisplayName("The public list says who, and nothing about them")
    void publishesNameAndIdentifierOnly() {
        var body = given().when().get(PUBLIC_TEAM).then().statusCode(200)
                .extract().body().asString();

        // No role, so a customer cannot tell the owner from an employee; no
        // hours, because an individual's week is a fact about a named person.
        assertThat(body)
                .doesNotContain("role")
                .doesNotContain("OWNER")
                .doesNotContain("active")
                .doesNotContain("bookable");
    }

    @Test
    @DisplayName("An unpublished provider has no team to read")
    void hidesTheTeamOfAnUnpublishedProvider() {
        given().when().get("/v1/providers/barbier-cache/staff").then().statusCode(404);
    }

    @Test
    @DisplayName("Someone who has left is stood down, never deleted")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void standsAMemberDown() {
        String id = add(member("Mariama", true, true));

        given().contentType("application/json").body(member("Mariama", true, false))
                .when().put(TEAM + "/" + id).then().statusCode(200)
                .body("active", is(false));

        // Still on the team, so her past appointments still name someone.
        assertThat(team()).contains("Mariama");
        given().when().get(PUBLIC_TEAM).then().statusCode(200).body("data", hasSize(1));
    }

    @Test
    @DisplayName("The last bookable person at a published salon cannot be stood down")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesToEmptyAPublishedSalon() {
        // salon-fatou is published with exactly one person. Standing her down
        // leaves a live page whose hours are computed from nobody: a customer
        // finds it, finds no slots, and does not come back.
        String owner = given().when().get(TEAM).then().statusCode(200)
                .extract().jsonPath().getString("data[0].staff_id");

        given().contentType("application/json").body(member("Fatou", true, false))
                .when().put(TEAM + "/" + owner).then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        // Making her unbookable empties it just as thoroughly.
        given().contentType("application/json").body(member("Fatou", false, true))
                .when().put(TEAM + "/" + owner).then().statusCode(409);
    }

    @Test
    @DisplayName("With someone else bookable, standing one down is allowed")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void allowsItOnceSomeoneElseCanTakeTheChair() {
        add(member("Mariama", true, true));

        String owner = given().when().get(TEAM).then().statusCode(200)
                .extract().jsonPath().getString("data.find { it.role == 'OWNER' }.staff_id");

        given().contentType("application/json").body(member("Fatou", true, false))
                .when().put(TEAM + "/" + owner).then().statusCode(200);
    }

    @Test
    @DisplayName("An unpublished salon may empty its team freely")
    @TestSecurity(user = BookingFixtures.SOLO_SUBJECT,
                  roles = {"dashboard:read", "staff:write", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SOLO_SUBJECT))
    void allowsItWhileUnpublished() {
        // Nothing is visible to anyone, so the platform has no business
        // fighting a salon that is reorganising.
        given().contentType("application/json")
                .body("""
                      {"business_name":"Coiffeur Solo","timezone":"Africa/Conakry",
                       "published":false}
                      """)
                .when().put("/v1/provider-profile").then().statusCode(200);

        String owner = given().when().get(TEAM).then().statusCode(200)
                .extract().jsonPath().getString("data[0].staff_id");

        given().contentType("application/json").body(member("Solo", true, false))
                .when().put(TEAM + "/" + owner).then().statusCode(200);
    }

    @Test
    @DisplayName("Another provider's member is a 404, exactly like one that never existed")
    @TestSecurity(user = BookingFixtures.SOLO_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SOLO_SUBJECT))
    void refusesToTouchSomeoneElsesMember() {
        String stranger = "a1a1a1a1-0000-0000-0000-000000000001";   // Fatou, at the salon
        String nobody = "a9a9a9a9-0000-0000-0000-000000000009";

        var theirs = given().contentType("application/json").body(member("Vole", true, true))
                .when().put(TEAM + "/" + stranger).then().statusCode(404)
                .extract().jsonPath().getString("code");

        given().contentType("application/json").body(member("Vole", true, true))
                .when().put(TEAM + "/" + nobody).then().statusCode(404)
                .body("code", equalTo(theirs));
    }

    @Test
    @DisplayName("Writing to the team needs the scope for it")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesAReadOnlyToken() {
        given().contentType("application/json").body(member("Mariama", true, true))
                .when().post(TEAM).then().statusCode(403);
    }
}
