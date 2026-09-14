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

    /** A service handed over and collected, so the queue has something to hold. */
    private static String anAlteration() {
        return given().contentType("application/json")
                .body("""
                      {"name":"Retouche ourlet","duration_minutes":10,
                       "turnaround_hours":48,
                       "price":{"amount_minor":50000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(201)
                .extract().path("service_offering_id");
    }

    @Test
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "appointments:write", "catalog:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    @DisplayName("The queue asks for drop-offs instead of sifting the whole agenda")
    void filtersOnHowTheWorkReachesTheCustomer() {
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000101");
        book(SALON_BOOKING, UUID.fromString(anAlteration()), "2026-09-04T14:00:00Z", "622000102");

        int everything = given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get(AGENDA).then().statusCode(200).extract().path("total");

        var queue = given().queryParam("from", "2026-09-01T00:00:00Z")
                .queryParam("fulfilment", "DROP_OFF")
                .when().get(AGENDA).then().statusCode(200).extract().jsonPath();

        // The screen used to ask for ninety days either side with a limit of
        // two hundred and sift them in the browser, so a busy workshop lost
        // the rows past the limit - the oldest ones, which are exactly the
        // promises most likely to be late.
        assertThat(everything).isEqualTo(2);
        assertThat(queue.getInt("total")).isEqualTo(1);
        assertThat(queue.getList("data.fulfilment", String.class))
                .containsExactly("DROP_OFF");
    }

    @Test
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    @DisplayName("The total counts what matches, not what fits on the page")
    void countsBeyondThePage() {
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000103");
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T14:00:00Z", "622000104");

        // One row asked for, both counted. This is the whole point: the diary's
        // badge counted the ROWS of a request for two hundred, so a salon with
        // more than that was told it had exactly two hundred, for ever.
        var narrow = given().queryParam("from", "2026-09-01T00:00:00Z")
                .queryParam("limit", 1)
                .when().get(AGENDA).then().statusCode(200).extract().jsonPath();

        assertThat(narrow.getList("data")).hasSize(1);
        assertThat(narrow.getInt("total")).isEqualTo(2);
        assertThat(narrow.getString("next_cursor")).isNotNull();
    }

    @Test
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    @DisplayName("The total does not shrink as the caller pages forward")
    void theTotalIsNotTheRemainder() {
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000105");
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, "2026-09-04T14:00:00Z", "622000106");

        var first = given().queryParam("from", "2026-09-01T00:00:00Z").queryParam("limit", 1)
                .when().get(AGENDA).then().statusCode(200).extract().jsonPath();
        var second = given().queryParam("from", "2026-09-01T00:00:00Z").queryParam("limit", 1)
                .queryParam("cursor", first.getString("next_cursor"))
                .when().get(AGENDA).then().statusCode(200).extract().jsonPath();

        // A total that counted what is LEFT would be a different number on
        // every page, and a badge that moves while somebody scrolls is worse
        // than no badge at all.
        assertThat(second.getInt("total")).isEqualTo(first.getInt("total")).isEqualTo(2);
    }
}
