package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Narrowing the directory by how the work reaches the customer, and saying how
 * big the answer is.
 *
 * <p>Three things the design drew and the contract did not serve: the Mode
 * fieldset in the filters, the number on a place tile, and the count in the
 * toolbar. They are tested together because they are one property seen three
 * times - <b>a number or a filter must agree with the list it labels</b>. A
 * tile saying 8 that opens on 12 results, or a filter admitting a business
 * whose own badges do not carry the mode asked for, is worse than the missing
 * feature was.
 *
 * <p>Separate from {@link DirectoryCardIT}, which is about what a card carries,
 * and from {@link ProviderDirectoryIT}, which is about finding a business at
 * all. A failure here should read as a failure of the filters, not of either.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class DirectoryFilterIT {

    private static final String DIRECTORY = "/v1/providers";
    private static final String MAP = "/v1/localities";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        // Three businesses, each placed to answer one question.
        //
        // Salon Fatou keeps its on-site braids and gains a house call, so it is
        // the only business that travels.
        //
        // Coiffeur Solo gains a drop-off service that is RETIRED. That is the
        // case this whole class exists for: the business would match the filter
        // on the row alone, and must not, because a customer sent to a counter
        // that no longer takes work has been sent nowhere. Retired rather than
        // deleted, because that is the state the product actually produces - a
        // provider stops offering a service, they cannot un-create it.
        //
        // Barbier Cache is unpublished and gains a house call too, so the
        // filter and the tile both have something to wrongly admit.
        fixtures.execute("""
                INSERT INTO service_offerings
                  (id, provider_id, name, duration_minutes, price_amount_minor,
                   price_currency, price_visible, offers_on_site, offers_drop_off,
                   offers_at_customer, turnaround_hours, active) VALUES
                  ('5e111111-0000-0000-0000-000000000002','%s','Tresses a domicile',
                   90,200000,'GNF',true,false,false,true,NULL,true),
                  ('50103333-0000-0000-0000-000000000002','%s','Retouche express',
                   15,30000,'GNF',true,false,true,false,24,false),
                  ('5e222222-0000-0000-0000-000000000002','%s','Coupe a domicile',
                   45,90000,'GNF',true,false,false,true,NULL,true);
                """.formatted(BookingFixtures.SALON, BookingFixtures.SOLO,
                              BookingFixtures.HIDDEN));
        fileIn("salon-fatou", "ratoma");
        fileIn("coiffeur-solo", "matoto");
        fileIn("barbier-cache", "ratoma");
    }

    @Test
    @DisplayName("The mode filter returns the businesses offering it, and only those")
    void narrowsToTheModeAskedFor() {
        given().queryParam("fulfilment", "AT_CUSTOMER").when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].slug", equalTo("salon-fatou"))
                // The filter and the badge answer to one source, so a card
                // returned under a mode always carries that mode. If these two
                // ever disagree there are two definitions of what a business
                // offers, which is the defect this test is really guarding.
                .body("data[0].fulfilments", hasItem("AT_CUSTOMER"));
    }

    @Test
    @DisplayName("A retired service offers nothing, so it matches nothing")
    void aRetiredServiceDoesNotMatch() {
        // Coiffeur Solo's only drop-off service is inactive. The row is there,
        // the column says DROP_OFF, and the business must still be absent.
        given().queryParam("fulfilment", "DROP_OFF").when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data", empty())
                .body("total", equalTo(0));

        // And the same query answers once the service is offered again, which
        // is what says the assertion above measured `active` rather than a
        // filter that silently matches nothing at all.
        fixtures.execute("""
                UPDATE service_offerings SET active = true
                 WHERE id = '50103333-0000-0000-0000-000000000002'
                """);

        given().queryParam("fulfilment", "DROP_OFF").when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data.slug", contains("coiffeur-solo"))
                .body("total", equalTo(1));
    }

    @Test
    @DisplayName("Several modes ask for any of them, never for all of them")
    void severalModesAreAnyOfThem() {
        // Coiffeur Solo is on-site only and Salon Fatou is both. Asking for the
        // two modes returns both businesses: a customer ticking two boxes has
        // widened the question, not demanded a business that does everything.
        given().queryParam("fulfilment", "ON_SITE")
                .queryParam("fulfilment", "AT_CUSTOMER")
                .when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data.slug", containsInAnyOrder("coiffeur-solo", "salon-fatou"))
                .body("total", equalTo(2));
    }

    @Test
    @DisplayName("An unpublished business is behind no mode")
    void anUnpublishedBusinessIsNeverAdmitted() {
        // Barbier Cache travels, and does not exist as far as this role is
        // concerned. Nothing in the mode filter widens what the public read
        // policy admits.
        given().queryParam("fulfilment", "AT_CUSTOMER").when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data.slug", not(hasItem("barbier-cache")))
                .body("total", equalTo(1));
    }

    @Test
    @DisplayName("A mode the contract does not publish is refused, not ignored")
    void anUnknownModeIsRefused() {
        // What matters first: the request is REFUSED. Answering the whole
        // directory to a filter it did not understand would be the worst of the
        // available behaviours - the caller sees results, believes they are
        // filtered, and puts businesses that cannot serve this customer in
        // front of them.
        //
        // The code is 404 and not the 400 the operation declares, and that is
        // NOT this parameter's doing. RESTEasy Reactive answers 404 whenever a
        // typed query parameter fails to convert, so `limit=abc` has always
        // answered the same thing - asserted below so this stays a statement
        // about the platform rather than a guess about it. Making `fulfilment`
        // alone answer 400 would need a mapper over every parameter conversion
        // on the API, which is one decision for the whole surface and not a
        // patch for one filter.
        given().queryParam("fulfilment", "BY_PIGEON").when().get(DIRECTORY)
                .then().statusCode(404);

        given().queryParam("limit", "abc").when().get(DIRECTORY)
                .then().statusCode(404);
    }

    @Test
    @DisplayName("The total is the size of the answer, not the size of the page")
    void theTotalDoesNotShrinkWithThePage() {
        // What the toolbar could not say: "2 professionnels" rather than "1 sur
        // cette page". The count ignores the limit and ignores the cursor, so
        // it is the same number on both pages of a two-page answer.
        String cursor = given().queryParam("limit", 1).when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].slug", equalTo("coiffeur-solo"))
                .body("next_cursor", notNullValue())
                .body("total", equalTo(2))
                .extract().path("next_cursor");

        given().queryParam("limit", 1).queryParam("cursor", cursor)
                .when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data[0].slug", equalTo("salon-fatou"))
                .body("next_cursor", nullValue())
                .body("total", equalTo(2));
    }

    @Test
    @DisplayName("The total counts what was asked for, not the whole directory")
    void theTotalObeysEveryFilter() {
        given().when().get(DIRECTORY).then().statusCode(200)
                .body("total", equalTo(2));

        given().queryParam("locality", "matoto").when().get(DIRECTORY)
                .then().statusCode(200)
                .body("total", equalTo(1));

        given().queryParam("q", "introuvable").when().get(DIRECTORY)
                .then().statusCode(200)
                .body("data", empty())
                .body("total", equalTo(0));
    }

    @Test
    @DisplayName("A place counts down the tree, so a region is not empty")
    void aPlaceCountsEverythingBeneathIt() {
        given().when().get(MAP).then().statusCode(200)
                // One business filed in each of two communes.
                .body("data.find { it.slug == 'ratoma' }.provider_count", equalTo(1))
                .body("data.find { it.slug == 'matoto' }.provider_count", equalTo(1))
                // Conakry holds both. Counting only what is filed against the
                // region itself would print a zero on the tile the whole home
                // page is built around.
                .body("data.find { it.slug == 'conakry' }.provider_count", equalTo(2))
                // A commune nobody chose, and a prefecture at the other end of
                // the country. Zero is a real answer: the client hides the tile.
                .body("data.find { it.slug == 'kaloum' }.provider_count", equalTo(0))
                .body("data.find { it.slug == 'kankan' }.provider_count", equalTo(0));
    }

    @Test
    @DisplayName("The number on a tile is the number of results behind it")
    void theTileAgreesWithTheListItOpens() {
        // The property the count exists for, checked against the list itself
        // rather than against a number written twice in this file.
        for (String slug : new String[] {"ratoma", "matoto", "conakry", "kankan"}) {
            int onTheTile = given().when().get(MAP).then().statusCode(200)
                    .extract().path("data.find { it.slug == '" + slug + "' }.provider_count");

            given().queryParam("locality", slug).when().get(DIRECTORY)
                    .then().statusCode(200)
                    .body("total", equalTo(onTheTile));
        }
    }

    @Test
    @DisplayName("A suspended business is in nobody's tile")
    void aSuspendedBusinessIsNotCounted() {
        // The count is left to the public read policy rather than restating
        // which businesses are public, so a suspension has to remove a business
        // from the tile and from the list in the same breath.
        // The three facts move together or the row is refused: a suspension
        // carries when it happened and why, and the schema will not hold one
        // without the others.
        fixtures.execute("""
                UPDATE providers
                   SET status = 'SUSPENDED',
                       suspended_at = %s,
                       suspension_reason = 'signalements repetes'
                 WHERE slug = 'salon-fatou'
                """.formatted(BookingFixtures.APPLICATION_NOW));

        given().when().get(MAP).then().statusCode(200)
                .body("data.find { it.slug == 'ratoma' }.provider_count", equalTo(0))
                .body("data.find { it.slug == 'conakry' }.provider_count", equalTo(1));

        given().when().get(DIRECTORY).then().statusCode(200)
                .body("total", equalTo(1));
    }

    private void fileIn(String slug, String locality) {
        fixtures.execute("""
                UPDATE providers
                   SET locality_id = (SELECT id FROM localities WHERE slug = '%s')
                 WHERE slug = '%s'
                """.formatted(locality, slug));
    }
}
