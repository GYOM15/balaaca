package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What a customer sees before booking.
 *
 * <p>This is the counterpart to bookable-slots-only availability: hours are
 * published openly because a shop's hours are already on its door, while what is
 * taken is never published at all. The suite's job is to prove the page carries
 * what it should and nothing else - no platform standing, no hidden price, no
 * retired service, no unpublished provider.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class PublicProviderIT {

    private static final String SALON = "/v1/providers/salon-fatou";
    private static final String HIDDEN = "/v1/providers/barbier-cache";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("A handle nobody holds is a 404")
    void refusesAnUnknownHandle() {
        given().when().get("/v1/providers/personne-du-tout").then().statusCode(404)
                .body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("An unpublished provider is the same 404, byte for byte")
    void hidesAnUnpublishedProvider() {
        // Any way to tell these apart is an oracle for whether a business that
        // does not want to be found exists.
        String unknown = given().when().get("/v1/providers/personne-du-tout")
                .then().statusCode(404).extract().jsonPath().getString("code");
        given().when().get(HIDDEN).then().statusCode(404).body("code", equalTo(unknown));
    }

    @Test
    @DisplayName("The page carries the business and its services")
    void showsThePublicPage() {
        given().when().get(SALON).then().statusCode(200)
                .body("slug", equalTo("salon-fatou"))
                .body("business_name", equalTo("Salon Fatou"))
                .body("timezone", equalTo("Africa/Conakry"))
                .body("whatsapp_phone_e164", equalTo("+224622999001"))
                .body("services", hasSize(1))
                .body("services[0].name", equalTo("Tresses"))
                .body("services[0].duration_minutes", equalTo(60))
                .body("services[0].price.amount_minor", equalTo(150000))
                .body("services[0].price.currency", equalTo("GNF"));
    }

    @Test
    @DisplayName("The page says nothing about the platform's standing or the buffers")
    void publishesNoInternalField() {
        var body = given().when().get(SALON).then().statusCode(200).extract().body().asString();

        // A projection, not a filter: these are absent because the shape has no
        // room for them, and no condition has to remember to drop them.
        org.assertj.core.api.Assertions.assertThat(body)
                .doesNotContain("status")
                .doesNotContain("published")
                .doesNotContain("buffer_")
                .doesNotContain("price_visible");
    }

    @Test
    @DisplayName("A price the provider hides is absent, not zero")
    void withholdsAHiddenPrice() {
        // Rendered as 0 a hidden price reads as free, which is worse than not
        // saying. The decision is made inside catalog and the amount never
        // leaves the database.
        fixtures.execute("""
                UPDATE service_offerings SET price_visible = false
                 WHERE provider_id = '%s'
                """.formatted(BookingFixtures.SALON));

        given().when().get(SALON).then().statusCode(200)
                .body("services[0].name", equalTo("Tresses"))
                .body("services[0].price", nullValue());
    }

    @Test
    @DisplayName("A retired service is off the page")
    void omitsARetiredService() {
        fixtures.execute("""
                UPDATE service_offerings SET active = false
                 WHERE provider_id = '%s'
                """.formatted(BookingFixtures.SALON));

        given().when().get(SALON).then().statusCode(200).body("services", hasSize(0));
    }

    @Test
    @DisplayName("The hours come back with the zone they are written in")
    void publishesTheOpeningHours() {
        given().when().get(SALON + "/opening-hours").then().statusCode(200)
                .body("timezone", equalTo("Africa/Conakry"))
                // Monday to Saturday, one stretch each.
                .body("data", hasSize(6))
                .body("data[0].day_of_week", equalTo(1))
                .body("data[0].start_time", equalTo("08:00"))
                .body("data[0].end_time", equalTo("20:00"));
    }

    @Test
    @DisplayName("Two people on the same shift are one open window")
    void mergesTheHoursOfEveryone() {
        // A second barber whose Monday overlaps the first's. The shop is open
        // once, and a client laying out a grid must not draw Monday twice.
        fixtures.execute("""
                INSERT INTO provider_staff (id, provider_id, display_name, role)
                     VALUES ('a2a2a2a2-0000-0000-0000-000000000001','%s','Mariama','STAFF');
                INSERT INTO availability_rules
                       (id, provider_id, staff_id, day_of_week, start_time, end_time)
                     VALUES (gen_random_uuid(),'%s','a2a2a2a2-0000-0000-0000-000000000001',
                             1,'18:00','22:00')
                """.formatted(BookingFixtures.SALON, BookingFixtures.SALON));

        given().when().get(SALON + "/opening-hours").then().statusCode(200)
                .body("data", hasSize(6))
                .body("data[0].day_of_week", equalTo(1))
                .body("data[0].start_time", equalTo("08:00"))
                .body("data[0].end_time", equalTo("22:00"));
    }

    @Test
    @DisplayName("A disabled person's leftover hours do not keep the shop open")
    void ignoresDisabledStaff() {
        fixtures.execute("""
                INSERT INTO provider_staff (id, provider_id, display_name, role, status)
                     VALUES ('a3a3a3a3-0000-0000-0000-000000000001','%s','Parti','STAFF','DISABLED');
                INSERT INTO availability_rules
                       (id, provider_id, staff_id, day_of_week, start_time, end_time)
                     VALUES (gen_random_uuid(),'%s','a3a3a3a3-0000-0000-0000-000000000001',
                             7,'09:00','13:00')
                """.formatted(BookingFixtures.SALON, BookingFixtures.SALON));

        given().when().get(SALON + "/opening-hours").then().statusCode(200)
                .body("data.day_of_week", not(org.hamcrest.Matchers.hasItem(7)));
    }

    @Test
    @DisplayName("Hours whose period has ended are not published")
    void ignoresExpiredRules() {
        fixtures.execute("""
                INSERT INTO availability_rules
                       (id, provider_id, staff_id, day_of_week, start_time, end_time,
                        effective_to)
                     VALUES (gen_random_uuid(),'%s','a1a1a1a1-0000-0000-0000-000000000001',
                             7,'09:00','13:00','2020-01-01')
                """.formatted(BookingFixtures.SALON));

        given().when().get(SALON + "/opening-hours").then().statusCode(200)
                .body("data.day_of_week", not(org.hamcrest.Matchers.hasItem(7)));
    }

    @Test
    @DisplayName("An unpublished provider has no hours to read either")
    void hidesTheHoursOfAnUnpublishedProvider() {
        given().when().get(HIDDEN + "/opening-hours").then().statusCode(404);
    }
}
