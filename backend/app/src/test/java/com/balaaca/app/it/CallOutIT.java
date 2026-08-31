package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
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
 * The provider travels.
 *
 * <p>The third shape of a transaction here, and the one V025 admitted without
 * being able to serve: widening the trades let in a plumber, an electrician, a
 * cleaner, a mover, an air-conditioning fitter, a solar fitter and a pest
 * controller, and every one of their appointments needs an address. There was
 * nowhere to put one - the booking form asked for a name, a phone and a note.
 *
 * <p>What is deliberately NOT tested here is a coordinate, because there is no
 * column for one. A latitude and longitude, or a Plus Code, is the same fact
 * about a private home at metre precision, and nothing in this product reads
 * it: no map, no routing, no dispatch. A customer pasting a Plus Code into the
 * directions is doing the right thing, and it is kept as the words they wrote.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "catalog:write", "appointments:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class CallOutIT {

    private static final String BOOK = "/v1/providers/salon-fatou/appointments";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    /** A plumber's call-out: ninety minutes at the customer's address. */
    private static String aCallOut() {
        return given().contentType("application/json")
                .body("""
                      {"name":"Depannage plomberie","duration_minutes":90,
                       "location":"AT_CUSTOMER",
                       "price":{"amount_minor":250000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(201)
                .body("fulfilment", equalTo("AT_CUSTOMER"))
                .extract().path("service_offering_id");
    }

    private static io.restassured.response.ValidatableResponse book(String offering,
                                                                    String address) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s",
                       "starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000001"}%s}
                      """.formatted(BookingFixtures.SALON_OWNER_STAFF, offering, address))
                .when().post(BOOK).then();
    }

    @Test
    @DisplayName("A service that travels says so, and one that does not is unchanged")
    void theShapeIsPublished() {
        aCallOut();

        given().when().get("/v1/service-offerings").then().statusCode(200)
                .body("data.find { it.name == 'Depannage plomberie' }.fulfilment",
                      equalTo("AT_CUSTOMER"))
                // Tresses, seeded with no location at all: the column defaults
                // to AT_PROVIDER, which is what every service created before
                // this existed actually is.
                .body("data.find { it.name == 'Tresses' }.fulfilment", equalTo("ON_SITE"));
    }

    @Test
    @DisplayName("A call-out cannot also be dropped off")
    void theTwoShapesAreExclusive() {
        // Asking the customer to deliver an item to their own house is not a
        // service anybody sells, and the table refuses it too.
        given().contentType("application/json")
                .body("""
                      {"name":"Impossible","duration_minutes":30,
                       "location":"AT_CUSTOMER","turnaround_hours":48,
                       "price":{"amount_minor":1000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(400);
    }

    @Test
    @DisplayName("A call-out with nowhere to go is refused")
    void theAddressIsRequired() {
        book(aCallOut(), "").statusCode(422)
                .body("code", equalTo("VALIDATION_FAILED"))
                .body("title", containsString("customer's address"));
    }

    @Test
    @DisplayName("A shop appointment carrying a home address is refused too")
    void theAddressIsRefusedWhenNobodyTravels() {
        // The direction that matters as much as the first. Storing where a
        // customer lives for an appointment that happens at the salon is how a
        // directory turns into a list of where its customers live.
        book(BookingFixtures.SALON_OFFERING.toString(),
             ",\"service_address\":{\"directions\":\"Nongo, portail bleu\"}")
                .statusCode(422)
                .body("title", containsString("provider's address"));
    }

    @Test
    @DisplayName("The address travels to the diary, and only to the diary")
    void theDiaryKnowsWhereToGo() {
        String offering = aCallOut();
        String reference = book(offering, """
                ,"service_address":{"locality_slug":"ratoma","area":"Nongo",
                 "directions":"Derriere la mosquee, portail bleu"}""")
                .statusCode(201).extract().path("reference");

        given().when().get("/v1/appointments?from=2026-09-07T00:00:00Z").then().statusCode(200)
                .body("data[0].service_address.locality_slug", equalTo("ratoma"))
                .body("data[0].service_address.area", equalTo("Nongo"))
                .body("data[0].service_address.directions",
                      equalTo("Derriere la mosquee, portail bleu"));

        // Not on the customer's own view. That one is reached by a reference
        // rather than by a login, the customer already knows where they live,
        // and a leaked reference must not also hand out a home address.
        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("service_address", nullValue());
    }

    @Test
    @DisplayName("A commune the map does not hold is refused, not stored as none")
    void anUnknownLocalityIsRefused() {
        book(aCallOut(), """
                ,"service_address":{"locality_slug":"atlantide","directions":"quelque part"}""")
                .statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A commune given by an accepted spelling is stored as the map spells it")
    void theLocalityIsCanonicalised() {
        book(aCallOut(), """
                ,"service_address":{"locality_slug":"Ratoma","directions":"portail bleu"}""")
                .statusCode(201);

        given().when().get("/v1/appointments?from=2026-09-07T00:00:00Z").then().statusCode(200)
                .body("data[0].service_address.locality_slug", equalTo("ratoma"));
    }

    @Test
    @DisplayName("A quartier alone is enough; the dropdown is not mandatory")
    void theCommuneIsOptional() {
        // "Nongo, behind the mosque" tells the plumber everything he needs.
        // Refusing the booking because the customer did not also pick a commune
        // from a list would lose the booking.
        book(aCallOut(), """
                ,"service_address":{"area":"Nongo","directions":"portail bleu"}""")
                .statusCode(201);

        given().when().get("/v1/appointments?from=2026-09-07T00:00:00Z").then().statusCode(200)
                .body("data[0].service_address.locality_slug", nullValue())
                .body("data[0].service_address.area", equalTo("Nongo"));
    }

    @Test
    @DisplayName("A retried booking with a corrected address is refused, not silently ignored")
    void aChangedAddressIsNotAReplay() {
        String offering = aCallOut();
        String key = "k-" + UUID.randomUUID();
        String body = """
                {"staff_id":"%s","service_offering_id":"%s",
                 "starts_at":"2026-09-07T10:00:00Z",
                 "customer":{"full_name":"Cliente","phone":"622000001"},
                 "service_address":{"directions":"%s"}}
                """;

        given().contentType("application/json").header("Idempotency-Key", key)
                .body(body.formatted(BookingFixtures.SALON_OWNER_STAFF, offering,
                                     "Nongo, portail bleu"))
                .when().post(BOOK).then().statusCode(201);

        // Without the address in the fingerprint this answers 201 with the
        // FIRST appointment, so a customer who spotted the wrong street would
        // be told it worked while a plumber drove to the old one.
        given().contentType("application/json").header("Idempotency-Key", key)
                .body(body.formatted(BookingFixtures.SALON_OWNER_STAFF, offering,
                                     "Kipe, portail vert"))
                .when().post(BOOK).then().statusCode(422)
                .body("code", equalTo("IDEMPOTENCY_KEY_REUSED"));
    }

    @Test
    @DisplayName("The visit occupies the chair like any other appointment")
    void aCallOutIsStillAnOccupation() {
        String offering = aCallOut();
        String address = ",\"service_address\":{\"directions\":\"Nongo, portail bleu\"}";

        book(offering, address).statusCode(201);
        // Ninety minutes from ten o'clock: the plumber is out, and the same
        // person cannot be at a second address at half past.
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s",
                       "starts_at":"2026-09-07T10:30:00Z",
                       "customer":{"full_name":"Autre","phone":"622000002"},
                       "service_address":{"directions":"Kipe"}}
                      """.formatted(BookingFixtures.SALON_OWNER_STAFF, offering))
                .when().post(BOOK).then().statusCode(409);
    }
}
