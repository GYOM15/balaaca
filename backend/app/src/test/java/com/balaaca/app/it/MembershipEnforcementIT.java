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
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Who may do what inside their own business, and what revocation revokes.
 *
 * <p>Two holes this suite exists to keep shut, both of which were open and both
 * of which a scope could never have closed. {@code provider_staff.role} was
 * written at registration and read by nothing, so any member with an account
 * could unpublish the storefront and re-price the whole catalogue. And neither
 * {@code users.status} nor {@code providers.status} was consulted anywhere, so
 * suspending an account or a business revoked precisely nothing.
 *
 * <p>Every caller here holds the full set of scopes on purpose. That is what a
 * real token carries, and it is exactly the situation in which a scope check
 * decides nothing and the database has to.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class MembershipEnforcementIT {

    private static final String[] EVERYTHING = {
            "dashboard:read", "profile:write", "catalog:write",
            "schedule:write", "staff:write", "appointments:write"};

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        fixtures.seedEmployee();
    }

    @Nested
    @DisplayName("An employee belongs here and does not own the place")
    class Employee {

        @Test
        @DisplayName("They can find out which chair is theirs, and then read its week")
        @TestSecurity(user = BookingFixtures.EMPLOYEE_SUBJECT, roles = {
                "dashboard:read", "schedule:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.EMPLOYEE_SUBJECT))
        void knowsWhichChairIsTheirs() {
            String me = given().when().get("/v1/me").then().statusCode(200)
                    .body("display_name", equalTo("Mariama"))
                    .body("role", equalTo("STAFF"))
                    .extract().path("staff_id");

            // The whole point of the route. Every schedule operation asks for a
            // staff_id, and the only place one was published was the team
            // listing - where an employee saw every colleague's identifier and
            // had no way to tell which was theirs.
            assertThat(me).isEqualTo(BookingFixtures.SALON_EMPLOYEE_STAFF.toString());

            given().queryParam("staff_id", me)
                    .when().get("/v1/opening-hours").then().statusCode(200);
        }

        @Test
        @DisplayName("They read the agenda and the team like anyone who works here")
        @TestSecurity(user = BookingFixtures.EMPLOYEE_SUBJECT, roles = {
                "dashboard:read", "profile:write", "catalog:write",
                "schedule:write", "staff:write", "appointments:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.EMPLOYEE_SUBJECT))
        void readsWhatColleaguesShare() {
            given().when().get("/v1/staff").then().statusCode(200).body("data", hasSize(2));
            given().queryParam("from", "2026-09-01T00:00:00Z")
                    .when().get("/v1/appointments").then().statusCode(200);
            given().when().get("/v1/provider-profile").then().statusCode(200);
        }

        @Test
        @DisplayName("They cannot unpublish the storefront")
        @TestSecurity(user = BookingFixtures.EMPLOYEE_SUBJECT, roles = {
                "dashboard:read", "profile:write", "catalog:write",
                "schedule:write", "staff:write", "appointments:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.EMPLOYEE_SUBJECT))
        void cannotChangeThePublicPage() {
            // The token carries profile:write. The refusal comes from the
            // database's answer about who this person is, not from the token.
            given().contentType("application/json")
                    .body("""
                          {"business_name":"Detourne","timezone":"Africa/Conakry",
                           "published":false}
                          """)
                    .when().put("/v1/provider-profile").then().statusCode(403)
                    .body("code", equalTo("FORBIDDEN"));

            given().when().get("/v1/providers/salon-fatou").then().statusCode(200);
        }

        @Test
        @DisplayName("They cannot add or stand down a colleague")
        @TestSecurity(user = BookingFixtures.EMPLOYEE_SUBJECT, roles = {
                "dashboard:read", "profile:write", "catalog:write",
                "schedule:write", "staff:write", "appointments:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.EMPLOYEE_SUBJECT))
        void cannotComposeTheTeam() {
            given().contentType("application/json")
                    .body("{\"display_name\":\"Complice\",\"bookable\":true,\"active\":true}")
                    .when().post("/v1/staff").then().statusCode(403);

            given().contentType("application/json")
                    .body("{\"display_name\":\"Fatou\",\"bookable\":true,\"active\":false}")
                    .when().put("/v1/staff/" + BookingFixtures.SALON_OWNER_STAFF)
                    .then().statusCode(403);
        }

        @Test
        @DisplayName("They set their own hours and nobody else's")
        @TestSecurity(user = BookingFixtures.EMPLOYEE_SUBJECT, roles = {
                "dashboard:read", "profile:write", "catalog:write",
                "schedule:write", "staff:write", "appointments:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.EMPLOYEE_SUBJECT))
        void writesOnlyTheirOwnWeek() {
            String week = """
                          {"staff_id":"%s","data":[
                            {"day_of_week":3,"start_time":"10:00","end_time":"16:00"}]}
                          """;

            given().contentType("application/json")
                    .body(week.formatted(BookingFixtures.SALON_EMPLOYEE_STAFF))
                    .when().put("/v1/opening-hours").then().statusCode(200);

            // Emptying a colleague's diary, or opening one on a day they do not
            // work, is the same wrong and the same refusal.
            given().contentType("application/json")
                    .body(week.formatted(BookingFixtures.SALON_OWNER_STAFF))
                    .when().put("/v1/opening-hours").then().statusCode(403)
                    .body("code", equalTo("FORBIDDEN"));
        }
    }

    @Nested
    @DisplayName("The owner")
    class Owner {

        @Test
        @DisplayName("Does everything an employee cannot")
        @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {
                "dashboard:read", "profile:write", "catalog:write",
                "schedule:write", "staff:write", "appointments:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
        void isNotRefused() {
            given().contentType("application/json")
                    .body("{\"display_name\":\"Aissatou\",\"bookable\":true,\"active\":true}")
                    .when().post("/v1/staff").then().statusCode(201);

            given().contentType("application/json")
                    .body("""
                          {"staff_id":"%s","data":[
                            {"day_of_week":3,"start_time":"10:00","end_time":"16:00"}]}
                          """.formatted(BookingFixtures.SALON_EMPLOYEE_STAFF))
                    .when().put("/v1/opening-hours").then().statusCode(200);
        }

        @Test
        @DisplayName("Is told so by the same route an employee uses")
        @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
        void knowsTheyOwnThePlace() {
            given().when().get("/v1/me").then().statusCode(200)
                    .body("staff_id", equalTo(BookingFixtures.SALON_OWNER_STAFF.toString()))
                    .body("role", equalTo("OWNER"));
        }
    }

    @Nested
    @DisplayName("A token that belongs to nobody here")
    class Stranger {

        @Test
        @DisplayName("Is told it has an account and not a business")
        @TestSecurity(user = BookingFixtures.STRANGER_SUBJECT, roles = "dashboard:read")
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.STRANGER_SUBJECT))
        void isRefusedRatherThanEmptied() {
            // Not an empty body: a signed-in person with no membership has an
            // account, not a salon, and the difference between "finish signing
            // up" and "something broke" is the whole answer.
            given().when().get("/v1/me").then().statusCode(403)
                    .body("code", equalTo("FORBIDDEN"));
        }
    }

    @Nested
    @DisplayName("Suspension, which suspended nothing")
    class Suspension {

        @Test
        @DisplayName("A closed account loses its tenant on the very next request")
        @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {
                "dashboard:read", "profile:write", "catalog:write",
                "schedule:write", "staff:write", "appointments:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
        void revokesADeletedAccountImmediately() {
            given().when().get("/v1/provider-profile").then().statusCode(200);

            fixtures.execute("""
                    UPDATE users SET status = 'DELETED'
                     WHERE keycloak_user_id = '%s'
                    """.formatted(BookingFixtures.SALON_SUBJECT));

            // Membership is re-read uncached on every request precisely so this
            // is immediate. users.status was the one column that made it not.
            given().when().get("/v1/provider-profile").then().statusCode(403)
                    .body("code", equalTo("FORBIDDEN"));
        }

        @Test
        @DisplayName("A suspended business loses its public page, and keeps its diary")
        @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {
                "dashboard:read", "profile:write", "catalog:write",
                "schedule:write", "staff:write", "appointments:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
        void revokesASuspendedProviderEverywhere() {
            fixtures.execute("""
                    UPDATE providers
                       SET status = 'SUSPENDED', suspended_at = now(),
                           suspension_reason = 'essai'
                     WHERE id = '%s'
                    """.formatted(BookingFixtures.SALON));

            // This assertion is the reverse of what it was, and the reversal is
            // deliberate. It used to be 403: a suspended business lost the
            // dashboard too.
            //
            // What changed is that suspension now has a defined effect on
            // appointments - it has none. The bookings already made stand,
            // because cancelling somebody's Thursday to punish their salon
            // punishes the customer. Those people are still coming, and a
            // provider locked out of their own diary cannot see who: the
            // lockout would manufacture the exact missed appointments the
            // suspension existed to prevent.
            //
            // So the standing gates the PUBLIC surface and nothing else. It is
            // also what makes the suspension reason on the profile worth
            // storing - a business must be able to read why its page vanished.
            given().when().get("/v1/provider-profile").then().statusCode(200)
                    .body("status", equalTo("SUSPENDED"))
                    .body("suspension_reason", equalTo("essai"));

            // Everything a stranger can reach is gone. Still taking bookings
            // would mean still taking customers' money and phone numbers
            // through a page the platform believes it pulled.
            given().when().get("/v1/providers/salon-fatou").then().statusCode(404);
            given().when().get("/v1/providers/salon-fatou/staff").then().statusCode(404);

            assertThat(given().when().get("/v1/providers").then().statusCode(200)
                    .extract().jsonPath().getList("data.slug", String.class))
                    .doesNotContain("salon-fatou");
        }
    }

    @Nested
    @DisplayName("Browsing several trades at once")
    class WeddingSection {

        @Test
        @DisplayName("A wedding is a query over trades, not a trade")
        void filtersOnSeveralCategories() {
            fixtures.execute("""
                    UPDATE providers SET category_id =
                      (SELECT id FROM provider_categories WHERE slug = 'photographie')
                     WHERE slug = 'salon-fatou';
                    UPDATE providers SET category_id =
                      (SELECT id FROM provider_categories WHERE slug = 'traiteur')
                     WHERE slug = 'coiffeur-solo'
                    """);

            assertThat(given()
                    .queryParam("category_slug", "photographie", "traiteur", "dj-animation")
                    .when().get("/v1/providers").then().statusCode(200)
                    .extract().jsonPath().getList("data.business_name", String.class))
                    .containsExactly("Coiffeur Solo", "Salon Fatou");

            assertThat(given().queryParam("category_slug", "dj-animation")
                    .when().get("/v1/providers").then().statusCode(200)
                    .extract().jsonPath().getList("data.slug", String.class))
                    .isEmpty();
        }

        @Test
        @DisplayName("The shipped taxonomy is what a signup can name")
        @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
        void registersUnderASeededTrade() {
            given().contentType("application/json")
                    .body("""
                          {"slug":"studio-awa","business_name":"Studio Awa",
                           "category_slug":"photographie"}
                          """)
                    .when().post("/v1/providers").then().statusCode(201);
        }
    }
}
