package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The authenticated path, end to end, and the one thing it must never do.
 *
 * <p>Until this suite existed the whole chain - verified subject, then
 * {@code app_resolve_provider}, then the tenant GUC, then every RLS policy -
 * had no test at all. It is the most security-critical code in the project and
 * the only part of it a reviewer could not check by running anything.
 *
 * <p>The token is minted in-process rather than by a Keycloak: what is under
 * test is what the database does with a subject, not that an identity provider
 * can sign. The subject is the only claim that matters, because it is the only
 * one the tenant is resolved from - never a provider claim, which a token could
 * carry and a caller could ask for.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class AgendaIT {

    private static final String AGENDA = "/v1/appointments";
    private static final String SALON_BOOKING = "/v1/providers/salon-fatou/appointments";
    private static final String SOLO_BOOKING = "/v1/providers/coiffeur-solo/appointments";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static void book(String path, UUID offering, String startsAt, String phone) {
        given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Mariama B.","phone":"%s"}}
                      """.formatted(offering, startsAt, phone))
                .when().post(path).then().statusCode(201);
    }

    private static List<String> agenda() {
        return given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get(AGENDA).then().statusCode(200)
                .extract().jsonPath().getList("data.service_name", String.class);
    }

    @Test
    @DisplayName("Without a token there is no agenda to read")
    void refusesAnAnonymousCaller() {
        given().when().get(AGENDA).then().statusCode(401);
    }

    @Test
    @DisplayName("A valid token belonging to nobody here is refused, not emptied")
    @TestSecurity(user = BookingFixtures.STRANGER_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.STRANGER_SUBJECT))
    void refusesASubjectWithNoMembership() {
        // 403 and not an empty 200: an account that silently shows nothing is
        // indistinguishable from one whose provider has no bookings, and the
        // person holding it will spend a morning wondering which.
        given().when().get(AGENDA).then().statusCode(403).body("code", equalTo("FORBIDDEN"));
    }

    @Test
    @DisplayName("A provider sees their own bookings")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void showsTheCallersOwnAgenda() {
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000001");

        assertThat(agenda()).containsExactly("Tresses");
    }

    @Test
    @DisplayName("A provider never sees another's, even with the same query")
    @TestSecurity(user = BookingFixtures.SOLO_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SOLO_SUBJECT))
    void neverShowsAnotherProvidersAgenda() {
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000001");
        book(SOLO_BOOKING, BookingFixtures.SOLO_OFFERING, "2026-09-04T14:00:00Z", "622000002");

        // The request names no provider, so there is nothing to tamper with -
        // and if there were, the policy on the table would still answer this.
        assertThat(agenda()).containsExactly("Coupe");
        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isEqualTo(1);
    }

    @Test
    @DisplayName("The customer's number is the provider's to see, and only theirs")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void carriesTheCustomerForTheProvider() {
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000001");

        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get(AGENDA).then().statusCode(200)
                .body("data[0].customer.phone", equalTo("+224622000001"))
                .body("data[0].price.currency", equalTo("GNF"))
                .body("data[0].price.amount_minor", equalTo(150000))
                .body("data[0].status", equalTo("PENDING"));
    }

    @Test
    @DisplayName("The agenda pages, and the cursor resumes at the next booking")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void pagesTheAgenda() {
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000001");
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T12:00:00Z", "622000002");

        var first = given().queryParam("from", "2026-09-01T00:00:00Z").queryParam("limit", 1)
                .when().get(AGENDA).then().statusCode(200).extract();

        assertThat(first.jsonPath().getList("data")).hasSize(1);
        String cursor = first.jsonPath().getString("next_cursor");
        assertThat(cursor).isNotBlank();

        var second = given().queryParam("from", "2026-09-01T00:00:00Z")
                .queryParam("limit", 1).queryParam("cursor", cursor)
                .when().get(AGENDA).then().statusCode(200).extract();

        assertThat(second.jsonPath().getList("data.starts_at", String.class))
                .containsExactly("2026-09-04T12:00:00Z");
        assertThat(second.jsonPath().getString("next_cursor")).isNull();
    }
}
