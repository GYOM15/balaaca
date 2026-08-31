package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A business changing hands.
 *
 * <p>There was an OWNER and nothing moved it. A founder who sold the salon or
 * took a partner had one workaround - give somebody their password - which is
 * how one account ends up shared by three people and an audit trail stops
 * meaning anything.
 *
 * <p>"A provider has one owner" had been true by construction since V014 and
 * was written nowhere. The moment a transfer exists, construction stops being
 * the guarantee, so V040 made it an index - and a transfer that half-succeeded
 * would leave a business with two owners or none.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class OwnershipIT {

    private static final String OWNER = BookingFixtures.SALON_OWNER_STAFF.toString();
    private static final String EMPLOYEE = BookingFixtures.SALON_EMPLOYEE_STAFF.toString();

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        // Mariama has an account, which is what makes her able to take it over.
        fixtures.seedEmployee();
    }

    private static io.restassured.response.ValidatableResponse handOver(String to) {
        return given().when().post("/v1/staff/" + to + "/ownership").then();
    }

    @Test
    @DisplayName("The owner hands over, and stops being the owner in the same breath")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void theBusinessChangesHands() {
        handOver(EMPLOYEE).statusCode(200)
                // Owner first, so the screen reads correctly without sorting.
                .body("data[0].staff_id", equalTo(EMPLOYEE))
                .body("data[0].role", equalTo("OWNER"))
                .body("data.find { it.staff_id == '%s' }.role".formatted(OWNER),
                      equalTo("STAFF"));

        // And the old owner has really lost it: the next owner-only action is
        // refused, which is the whole point of the operation.
        handOver(OWNER).statusCode(403).body("code", equalTo("FORBIDDEN"));
    }

    @Test
    @DisplayName("A colleague cannot give away a business that is not theirs")
    @TestSecurity(user = BookingFixtures.EMPLOYEE_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.EMPLOYEE_SUBJECT))
    void onlyTheOwnerMayGiveItAway() {
        handOver(OWNER).statusCode(403).body("code", equalTo("FORBIDDEN"));
    }

    @Test
    @DisplayName("A chair with no account cannot be given a business")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void theRecipientMustBeAbleToSignIn() {
        // A bookable resource with no login. Handing the business to it would
        // leave it owned by somebody nobody can be: the role would resolve for
        // no subject, and the way out would be a migration.
        UUID chair = UUID.fromString("a9a9a9a9-0000-0000-0000-000000000001");
        fixtures.execute("""
                INSERT INTO provider_staff (id, provider_id, display_name, role)
                     VALUES ('%s','%s','Chaise','STAFF')
                """.formatted(chair, BookingFixtures.SALON));

        handOver(chair.toString()).statusCode(422)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("Handing it to oneself is not a transfer")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void thereIsNothingToMove() {
        handOver(OWNER).statusCode(422);
    }

    @Test
    @DisplayName("Another salon's employee is not a colleague")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void theTeamIsOnesOwn() {
        handOver("c3c3c3c3-0000-0000-0000-000000000001").statusCode(422);

        // And nothing moved: the salon still has exactly one owner, and it is
        // the person who tried.
        given().when().get("/v1/staff").then().statusCode(200)
                .body("data.find { it.staff_id == '%s' }.role".formatted(OWNER),
                      equalTo("OWNER"));
    }

    @Test
    @DisplayName("The handover is on the trail, because nobody reconstructs this from memory")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "staff:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void itIsRecorded() {
        handOver(EMPLOYEE).statusCode(200);

        org.junit.jupiter.api.Assertions.assertTrue(
                fixtures.auditTrail().stream()
                        .anyMatch(r -> r.action().equals("OWNERSHIP_TRANSFERRED")),
                "who owned the business before is the one thing nobody remembers");
    }
}
