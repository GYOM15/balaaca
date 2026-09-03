package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

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
 * One service, offered several ways.
 *
 * <p>A braider who does tresses in her salon and also at her customers' houses
 * was selling one service and made to publish two - two prices to keep in step,
 * two sets of photographs, and two entries a customer had to choose between for
 * no reason. The service now carries a SET of modes, and the choice moves to
 * where it always belonged: the customer, at booking.
 *
 * <p>The choice is then FROZEN. That is the half of this that has to be proved
 * rather than assumed: the shape can no longer be re-derived from the offering,
 * so an appointment that does not record it cannot say what was booked, and a
 * provider who stops travelling next month would silently turn last Thursday's
 * house call into a chair in her salon.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "catalog:write", "appointments:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class FulfilmentChoiceIT {

    private static final String BOOK = "/v1/providers/salon-fatou/appointments";
    private static final String AGENDA = "/v1/appointments?from=2026-09-07T00:00:00Z";

    private static final String HOME = """
            ,"service_address":{"locality_slug":"ratoma","area":"Nongo",
             "directions":"Derriere la mosquee, portail bleu"}""";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    /** Tresses, in the salon or at your house. One price, one duration. */
    private static String bothWays() {
        return given().contentType("application/json")
                .body("""
                      {"name":"Tresses a domicile ou au salon","duration_minutes":90,
                       "fulfilments":["ON_SITE","AT_CUSTOMER"],
                       "price":{"amount_minor":300000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(201)
                .body("fulfilments", containsInAnyOrder("ON_SITE", "AT_CUSTOMER"))
                .extract().path("service_offering_id");
    }

    private static io.restassured.response.ValidatableResponse book(String offering, String at,
                                                                    String mode, String address) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Cliente","phone":"622000001"}%s%s}
                      """.formatted(BookingFixtures.SALON_OWNER_STAFF, offering, at, mode, address))
                .when().post(BOOK).then();
    }

    private static String chose(String mode) {
        return ",\"fulfilment\":\"" + mode + "\"";
    }

    @Test
    @DisplayName("The same service booked two ways leaves two appointments, each frozen its own way")
    void theChoiceIsFrozenPerBooking() {
        String offering = bothWays();

        book(offering, "2026-09-07T10:00:00Z", chose("ON_SITE"), "").statusCode(201);
        book(offering, "2026-09-07T14:00:00Z", chose("AT_CUSTOMER"), HOME).statusCode(201);

        // Two rows from one service, and the diary can tell them apart. Ordered
        // by start, so the morning one is the salon appointment.
        given().when().get(AGENDA).then().statusCode(200)
                .body("data.size()", equalTo(2))
                .body("data[0].fulfilment", equalTo("ON_SITE"))
                .body("data[0].service_address", nullValue())
                .body("data[1].fulfilment", equalTo("AT_CUSTOMER"))
                .body("data[1].service_address.area", equalTo("Nongo"));
    }

    @Test
    @DisplayName("A service offered one way asks nothing, as every booking before this did")
    void oneModeNeedsNoChoice() {
        // Tresses, seeded on-site and nothing else. A request that names no mode
        // is what every client sent before the field existed, and it still means
        // the one thing the service is.
        book(BookingFixtures.SALON_OFFERING.toString(), "2026-09-07T10:00:00Z", "", "")
                .statusCode(201);

        given().when().get(AGENDA).then().statusCode(200)
                .body("data[0].fulfilment", equalTo("ON_SITE"));
    }

    @Test
    @DisplayName("A service offered several ways refuses to be booked without a choice")
    void severalModesNeedOne() {
        // No defensible default between sitting in a salon and having somebody
        // arrive at your house: one of the two answers is wrong, and the server
        // does not get to pick which customer it is wrong about.
        book(bothWays(), "2026-09-07T10:00:00Z", "", "").statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A mode the service does not offer is refused, not quietly corrected")
    void anUnofferedModeIsRefused() {
        // A client that has gone stale names something that is not on offer,
        // exactly like an unknown service would.
        book(bothWays(), "2026-09-07T10:00:00Z", chose("DROP_OFF"), "").statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("The address follows the choice, not the service")
    void theAddressIsOwedByTheChoice() {
        String offering = bothWays();

        // The same offering, both directions refused. Before the choice existed
        // this was a property of the service and could only be one of the two.
        book(offering, "2026-09-07T10:00:00Z", chose("AT_CUSTOMER"), "").statusCode(422)
                .body("title", org.hamcrest.Matchers.containsString("customer's address"));
        book(offering, "2026-09-07T10:00:00Z", chose("ON_SITE"), HOME).statusCode(422)
                .body("title", org.hamcrest.Matchers.containsString("provider's address"));
    }

    @Test
    @DisplayName("The promise is frozen only onto the booking that is a drop-off")
    void theTurnaroundBelongsToTheDropOff() {
        // A tailor who will do it while you wait or take it away for two days.
        String offering = given().contentType("application/json")
                .body("""
                      {"name":"Retouche","duration_minutes":30,
                       "fulfilments":["ON_SITE","DROP_OFF"],"turnaround_hours":48,
                       "price":{"amount_minor":50000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(201)
                .body("turnaround_hours", equalTo(48))
                .extract().path("service_offering_id");

        book(offering, "2026-09-07T10:00:00Z", chose("ON_SITE"), "").statusCode(201);
        book(offering, "2026-09-07T14:00:00Z", chose("DROP_OFF"), "").statusCode(201);

        // Freezing the offering's delay onto both would have promised the
        // customer who sat in the chair that something would be ready on Friday.
        given().when().get(AGENDA).then().statusCode(200)
                .body("data[0].fulfilment", equalTo("ON_SITE"))
                .body("data[0].ready_by", nullValue())
                .body("data[1].fulfilment", equalTo("DROP_OFF"))
                .body("data[1].ready_by", notNullValue());
    }

    @Test
    @DisplayName("A delay on a service nothing is handed over for is refused")
    void aTurnaroundWithoutADropOffIsRefused() {
        given().contentType("application/json")
                .body("""
                      {"name":"Impossible","duration_minutes":30,
                       "fulfilments":["ON_SITE"],"turnaround_hours":48,
                       "price":{"amount_minor":1000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(400);

        // And the other direction: a drop-off with no delay announced is a
        // promise nobody made.
        given().contentType("application/json")
                .body("""
                      {"name":"Impossible aussi","duration_minutes":30,
                       "fulfilments":["DROP_OFF"],
                       "price":{"amount_minor":1000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(400);
    }

    @Test
    @DisplayName("An empty set reads as no set at all, and lands on the spot")
    void anEmptySetReadsAsUnstated() {
        // NOT refused, and it cannot be. jaxrs-spec initialises an absent array
        // to an empty list, so an omitted `fulfilments` and an explicit `[]`
        // are the SAME object by the time any handler sees them. Refusing the
        // empty one therefore refuses the omitted one too - which is the whole
        // deprecated `location` path this document still promises, and six
        // suites that create offerings the old way.
        //
        // So the contract carries no `minItems` on the request, and both read
        // as "not stated": the service falls back to ON_SITE, exactly as it did
        // before this shape existed. Anyone tempted to add `minItems: 1` back
        // should run CallOutIT, DropOffIT, CompetenceIT, ProviderProfileIT,
        // ServiceCatalogueIT and ServicePhotoIT first.
        given().contentType("application/json")
                .body("""
                      {"name":"Rien","duration_minutes":30,"fulfilments":[],
                       "price":{"amount_minor":1000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings")
                .then().statusCode(201)
                .body("fulfilments", containsInAnyOrder("ON_SITE"))
                .body("service_offering_id", notNullValue());
    }

    @Test
    @DisplayName("The two spellings of the same fact are not accepted together")
    void bothSpellingsAreRefused() {
        given().contentType("application/json")
                .body("""
                      {"name":"Deux fois","duration_minutes":30,
                       "fulfilments":["AT_CUSTOMER"],"location":"AT_CUSTOMER",
                       "price":{"amount_minor":1000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(400);
    }
}
