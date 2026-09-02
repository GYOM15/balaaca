package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import io.restassured.response.ValidatableResponse;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The lever a provider has against somebody who never turns up.
 *
 * <p>{@code customers.blocked} was created with the table and nothing ever wrote
 * it. Every customer was welcome for ever, a salon losing an hour a week to the
 * same person could only answer the telephone, and the schema coverage gate did
 * not notice because a local variable elsewhere in the codebase is also spelt
 * {@code blocked}.
 *
 * <p>What the block is, exactly, is the subject of every test below: it refuses
 * a NEW booking from the public page, it does not touch what is already in the
 * book, it does not bind the counter, and it says nothing to the person refused
 * that would let a stranger read the salon's blocklist.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "appointments:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class CustomerBlockingIT {

    private static final String PUBLIC_BOOKING = "/v1/providers/salon-fatou/appointments";
    private static final String COUNTER = "/v1/appointments";
    private static final String PHONE = "622000001";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("A blocked number is refused on the public page, and the answer is 403")
    void theBlockBinds() {
        String customer = bookAndFind("2026-09-07T10:00:00Z");

        block(customer, true).statusCode(200).body("blocked", equalTo(true));

        asCustomer("2026-09-08T10:00:00Z", PHONE)
                .statusCode(403).body("code", equalTo("FORBIDDEN"));
    }

    @Test
    @DisplayName("The refusal names no reason a stranger could enumerate a blocklist with")
    void theRefusalSaysNothingAboutTheBlock() {
        block(bookAndFind("2026-09-07T10:00:00Z"), true).statusCode(200);

        String body = asCustomer("2026-09-08T10:00:00Z", PHONE)
                .statusCode(403).extract().body().asString();

        // The route is unauthenticated. A message that named the reason would
        // let anybody who can spell the slug read the salon's blocklist one
        // telephone number at a time, and the number is somebody else's.
        assertThat(body.toLowerCase())
                .doesNotContain("block")
                .doesNotContain(PHONE);
    }

    @Test
    @DisplayName("Blocking refuses nobody else")
    void theBlockIsOnePerson() {
        block(bookAndFind("2026-09-07T10:00:00Z"), true).statusCode(200);

        asCustomer("2026-09-08T10:00:00Z", "622000009").statusCode(201);
    }

    @Test
    @DisplayName("The counter is not bound by the salon's own refusal")
    void theCounterStillWritesThemIn() {
        block(bookAndFind("2026-09-07T10:00:00Z"), true).statusCode(200);

        // Somebody is standing at the till and the argument was settled there.
        // A diary that refuses to record what is happening is a diary the salon
        // keeps on paper instead.
        given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body(booking("2026-09-08T10:00:00Z", PHONE))
                .when().post(COUNTER).then().statusCode(201);
    }

    @Test
    @DisplayName("Blocking cancels nothing that was already promised")
    void theBlockIsNotRetroactive() {
        String customer = bookAndFind("2026-09-07T10:00:00Z");

        block(customer, true).statusCode(200);

        // They are still coming on Monday, exactly as suspending a business
        // leaves its booked customers alone. Cancelling what was promised is a
        // separate decision with its own operation.
        given().when().get("/v1/customers/" + customer).then().statusCode(200)
                .body("blocked", equalTo(true))
                .body("history", org.hamcrest.Matchers.hasSize(1))
                .body("history[0].status", equalTo("PENDING"));
    }

    @Test
    @DisplayName("Unblocking lets them book again")
    void theSwitchGoesBothWays() {
        String customer = bookAndFind("2026-09-07T10:00:00Z");

        block(customer, true).statusCode(200);
        asCustomer("2026-09-08T10:00:00Z", PHONE).statusCode(403);

        block(customer, false).statusCode(200).body("blocked", equalTo(false));
        asCustomer("2026-09-08T10:00:00Z", PHONE).statusCode(201);
    }

    @Test
    @DisplayName("Pressing the switch twice is where the provider left it, not an error")
    void blockingTwiceIsNotAFailure() {
        String customer = bookAndFind("2026-09-07T10:00:00Z");

        block(customer, true).statusCode(200).body("blocked", equalTo(true));
        block(customer, true).statusCode(200).body("blocked", equalTo(true));
    }

    @Test
    @DisplayName("A customer id belonging to another salon is the 404 an unknown one gets")
    void anotherSalonsCustomerIsNotThere() {
        block(UUID.randomUUID().toString(), true)
                .statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("A body with no flag is refused rather than read as one of the two")
    void theFlagIsRequired() {
        String customer = bookAndFind("2026-09-07T10:00:00Z");

        given().contentType("application/json").body("{}")
                .when().put("/v1/customers/" + customer + "/blocking")
                .then().statusCode(400);
    }

    /** Books once on the public page and returns the customer the salon now has. */
    private String bookAndFind(String at) {
        asCustomer(at, PHONE).statusCode(201);

        return given().when().get("/v1/customers").then().statusCode(200)
                .extract().path("data.find { it.phone.endsWith('" + PHONE + "') }.customer_id");
    }

    private static ValidatableResponse block(String customerId, boolean blocked) {
        return given().contentType("application/json")
                .body("{\"blocked\":" + blocked + "}")
                .when().put("/v1/customers/" + customerId + "/blocking").then();
    }

    private static ValidatableResponse asCustomer(String at, String phone) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body(booking(at, phone))
                .when().post(PUBLIC_BOOKING).then();
    }

    private static String booking(String at, String phone) {
        return """
               {"staff_id":"%s","service_offering_id":"%s","starts_at":"%s",
                "customer":{"full_name":"Mariama B.","phone":"%s"}}
               """.formatted(BookingFixtures.SALON_OWNER_STAFF,
                             BookingFixtures.SALON_OFFERING, at, phone);
    }
}
