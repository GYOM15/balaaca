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
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** The provider's catalogue, and the two things it must never let happen. */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "catalog:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class ServiceCatalogueIT {

    private static final String CATALOGUE = "/v1/service-offerings";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String service(String name, int minutes, long price) {
        return """
               {"name":"%s","duration_minutes":%d,
                "price":{"amount_minor":%d,"currency":"GNF"}}
               """.formatted(name, minutes, price);
    }

    @Test
    @DisplayName("A provider adds a service and reads it back")
    void createsAndLists() {
        given().contentType("application/json").body(service("Defrisage", 45, 90000))
                .when().post(CATALOGUE).then().statusCode(201)
                .body("name", equalTo("Defrisage"))
                .body("duration_minutes", equalTo(45))
                .body("price.amount_minor", equalTo(90000))
                .body("price.currency", equalTo("GNF"))
                // Defaults applied by the server, not left null for a client to
                // discover: a null buffer would reach the booking window.
                .body("buffer_before_minutes", equalTo(0))
                .body("active", equalTo(true));

        given().when().get(CATALOGUE).then().statusCode(200)
                .body("data.name", org.hamcrest.Matchers.hasItem("Defrisage"));
    }

    @Test
    @DisplayName("Two live services cannot share a name")
    void refusesADuplicateName() {
        given().contentType("application/json").body(service("Defrisage", 45, 90000))
                .when().post(CATALOGUE).then().statusCode(201);

        // The partial unique index decides, not a pre-check: two callers both
        // pass a check-then-insert and only one passes the index.
        given().contentType("application/json").body(service("defrisage", 30, 50000))
                .when().post(CATALOGUE).then()
                .statusCode(409).body("code", equalTo("INVALID_STATE_TRANSITION"));
    }

    @Test
    @DisplayName("A retired service frees its name and stays readable")
    void retiringFreesTheName() {
        String id = given().contentType("application/json").body(service("Defrisage", 45, 90000))
                .when().post(CATALOGUE).then().statusCode(201)
                .extract().path("service_offering_id");

        given().contentType("application/json")
                .body("""
                      {"name":"Defrisage","duration_minutes":45,
                       "price":{"amount_minor":90000,"currency":"GNF"},"active":false}
                      """)
                .when().put(CATALOGUE + "/" + id).then().statusCode(200)
                .body("active", equalTo(false));

        // The index is partial on the active rows, so the name is free again -
        // and the retired row is still there, because appointments booked at its
        // price still name it.
        given().contentType("application/json").body(service("Defrisage", 30, 50000))
                .when().post(CATALOGUE).then().statusCode(201);

        given().queryParam("active", false).when().get(CATALOGUE).then().statusCode(200)
                .body("data", hasSize(1));
    }

    @Test
    @DisplayName("Changing a price never moves what a past booking was quoted")
    void repricingLeavesHistoryAlone() {
        given().contentType("application/json")
                .header("Idempotency-Key", "key-1")
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-04T10:00:00Z",
                       "customer":{"full_name":"Mariama B.","phone":"622000001"}}
                      """.formatted(BookingFixtures.SALON_OFFERING))
                .when().post("/v1/providers/salon-fatou/appointments").then().statusCode(201);

        given().contentType("application/json")
                .body("""
                      {"name":"Tresses","duration_minutes":60,"buffer_before_minutes":15,
                       "buffer_after_minutes":10,
                       "price":{"amount_minor":999000,"currency":"GNF"}}
                      """)
                .when().put(CATALOGUE + "/" + BookingFixtures.SALON_OFFERING).then().statusCode(200)
                .body("price.amount_minor", equalTo(999000));

        // The appointment was quoted 150000 and still is. The price was frozen
        // onto the row at booking, which is the whole reason that column exists.
        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .body("data[0].price.amount_minor", equalTo(150000));
    }

    @Test
    @DisplayName("Another provider's service is not found, not forbidden")
    void cannotReachAnotherProvidersService() {
        given().contentType("application/json")
                .body(service("Coupe", 30, 50000))
                .when().put(CATALOGUE + "/" + BookingFixtures.HIDDEN_OFFERING).then()
                .statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("The catalogue pages, and the cursor resumes after the last read")
    void pages() {
        for (int i = 0; i < 3; i++) {
            given().contentType("application/json").body(service("Service " + i, 30, 1000))
                    .when().post(CATALOGUE).then().statusCode(201);
        }

        var first = given().queryParam("limit", 2).when().get(CATALOGUE)
                .then().statusCode(200).extract();
        List<String> firstNames = first.jsonPath().getList("data.name", String.class);
        assertThat(firstNames).hasSize(2);

        List<String> second = given().queryParam("limit", 2)
                .queryParam("cursor", first.jsonPath().getString("next_cursor"))
                .when().get(CATALOGUE).then().statusCode(200)
                .extract().jsonPath().getList("data.name", String.class);

        assertThat(second).doesNotContainAnyElementsOf(firstNames);
    }

    @Test
    @DisplayName("Reading the catalogue does not grant writing it")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesWithoutTheWriteScope() {
        given().contentType("application/json").body(service("Defrisage", 45, 90000))
                .when().post(CATALOGUE).then().statusCode(403);
    }
}
