package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The foot of a directory card: how a business can be reached, and from what
 * price.
 *
 * <p>Both are derived from the services the business publishes, so neither can
 * be seeded directly and both have to survive the aggregate. What that
 * aggregate has to get right is not arithmetic: a mode offered by two services
 * must appear once, a price the provider chose to hide must not become the
 * headline number, and a business with nothing published must produce an empty
 * foot rather than a wrong one.
 *
 * <p>Separate from {@link ProviderDirectoryIT}, which is about finding a
 * business at all - paging, filtering and the cursor. Nothing here touches
 * those, and a failure in one should not read as a failure in the other.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class DirectoryCardIT {

    private static final String DIRECTORY = "/v1/providers";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        // The salon gets three services covering two modes, with the cheapest
        // of the three priced out of sight. Three and not two on purpose: with
        // one service per mode nothing would prove that a mode two services
        // share is published once rather than twice.
        //
        // The barber keeps his single service and it is retired, which is the
        // state every business is in on the day it registers. Deleting the row
        // instead would test a shape the product never reaches - a provider
        // cannot un-create a service, only stop offering it.
        fixtures.execute("""
                INSERT INTO service_offerings
                  (id, provider_id, name, duration_minutes, price_amount_minor,
                   price_currency, price_visible, offers_on_site, offers_at_customer) VALUES
                  ('5e111111-0000-0000-0000-000000000002','%s','Tresses a domicile',
                   90,200000,'GNF',true,false,true),
                  ('5e111111-0000-0000-0000-000000000003','%s','Coupe enfant',
                   30,25000,'GNF',false,true,false);
                UPDATE service_offerings SET active = false WHERE provider_id = '%s';
                """.formatted(BookingFixtures.SALON, BookingFixtures.SALON,
                              BookingFixtures.SOLO));
    }

    @Test
    @DisplayName("A card names every mode its services offer, each of them once")
    void publishesTheModesItsServicesOffer() {
        // Two of the salon's three services are on-site. ON_SITE appears once,
        // and in the order the contract calls canonical, so a client can draw
        // the badges without sorting them itself.
        given().queryParam("q", "Salon Fatou").when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].fulfilments", contains("ON_SITE", "AT_CUSTOMER"));
    }

    @Test
    @DisplayName("The price is the lowest the business shows, not the lowest it has")
    void publishesTheLowestVisiblePrice() {
        // 25 000 is cheaper and hidden. A hidden price is not a cheap one, and
        // quoting it would publish the number the provider took off the page.
        given().queryParam("q", "Salon Fatou").when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data[0].price_from.amount_minor", equalTo(150000))
                .body("data[0].price_from.currency", equalTo("GNF"));
    }

    @Test
    @DisplayName("A business with nothing on offer claims no mode and quotes no price")
    void publishesNeitherWithoutAnActiveService() {
        // The state of every business between registering and publishing its
        // first service. Nothing to aggregate is not a badge saying so, and it
        // is certainly not a price of zero - which a card would draw as free.
        given().queryParam("q", "Coiffeur Solo").when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].fulfilments", anyOf(nullValue(), empty()))
                .body("data[0].price_from", nullValue());
    }
}
