package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What a customer can actually type into the hub's search box.
 *
 * <p>The box is the first thing on the home page and the whole point of it, and
 * it used to match the business NAME and nothing else. Somebody looking for
 * braids types "tresses"; no business is literally named Tresses; the answer was
 * nothing.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class DirectorySearchIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        fixtures.execute("""
                UPDATE providers SET category_id =
                        (SELECT id FROM provider_categories WHERE slug = 'photographie')
                 WHERE slug = 'coiffeur-solo';
                UPDATE providers SET category_id =
                        (SELECT id FROM provider_categories WHERE slug = 'coiffure')
                 WHERE slug = 'salon-fatou'
                """);
    }

    private static List<String> search(String q) {
        return given().queryParam("q", q).when().get("/v1/providers")
                .then().statusCode(200)
                .extract().jsonPath().getList("data.slug", String.class);
    }

    @Test
    @DisplayName("A customer finds a salon by what it does, not by what it is called")
    void findsAProviderByItsServiceName() {
        // Salon Fatou offers "Tresses". It is not named Tresses, and that used
        // to be the end of the search.
        assertThat(search("tresses")).containsExactly("salon-fatou");
    }

    @Test
    @DisplayName("A customer finds a provider by its trade")
    void findsAProviderByItsTrade() {
        // "photographie" is the label of the trade, not the name of the
        // business and not one of its services.
        assertThat(search("photograph")).containsExactly("coiffeur-solo");
    }

    @Test
    @DisplayName("The business name still matches, and case does not matter")
    void stillFindsAProviderByName() {
        assertThat(search("FATOU")).containsExactly("salon-fatou");
    }

    @Test
    @DisplayName("A retired service stops being findable")
    void doesNotMatchARetiredService() {
        fixtures.execute("""
                UPDATE service_offerings SET active = false
                 WHERE provider_id = '%s'
                """.formatted(BookingFixtures.SALON));

        // The provider is still there; the word is not one of its offers any
        // more, so it is not one of the ways to reach it.
        assertThat(search("tresses")).isEmpty();
        assertThat(search("Fatou")).containsExactly("salon-fatou");
    }

    @Test
    @DisplayName("An unpublished provider is not findable by its services either")
    void doesNotMatchAnUnpublishedProvidersServices() {
        // barbier-cache offers "Coupe" and is not published. The new policy
        // admits the services of PUBLISHED providers only - otherwise the search
        // would become a way to discover businesses the public path hides.
        assertThat(search("Coupe")).doesNotContain("barbier-cache");
    }

    @Test
    @DisplayName("Searching by service does not hand out the catalogue")
    void matchesWithoutPublishing() {
        var body = given().queryParam("q", "tresses").when().get("/v1/providers")
                .then().statusCode(200).extract().body().asString();

        // The row is MATCHED, never returned. A directory card carries a slug,
        // a name, the modes on offer and the lowest visible price; the
        // CATALOGUE - which service, at what price, for how long - belongs to
        // the provider's own page.
        //
        // Not `doesNotContain("price")` any more. That was a substring over the
        // whole body, and it passed only for as long as the card published no
        // money at all: `price_from` now contains it. What must not appear is
        // the matched SERVICE, so that is what is asserted, plus the fields
        // that would name one.
        assertThat(body)
                .doesNotContain("Tresses")
                .doesNotContain("service_offering")
                .doesNotContain("duration_minutes");
    }

    @Test
    @DisplayName("Public answers say how long they may be reused, and slots say never")
    void declaresItsCaching() {
        given().when().get("/v1/categories").then()
                .header("Cache-Control", equalTo("public, max-age=300"));
        given().when().get("/v1/providers").then()
                .header("Cache-Control", equalTo("public, max-age=60"));
        given().when().get("/v1/providers/salon-fatou").then()
                .header("Cache-Control", equalTo("public, max-age=60"));
        given().when().get("/v1/providers/salon-fatou/opening-hours").then()
                .header("Cache-Control", equalTo("public, max-age=300"));

        // The important one. Every booking changes this answer, so a stale slot
        // list sends a customer to a slot that is gone - the defect the
        // union-across-chairs fix removed, produced again from the other side.
        given().queryParam("service_offering_id", BookingFixtures.SALON_OFFERING)
                .queryParam("from", "2026-09-04").queryParam("to", "2026-09-04")
                .when().get("/v1/providers/salon-fatou/available-slots").then()
                .header("Cache-Control", equalTo("no-store"));
    }

    @Test
    @DisplayName("A trade written in the plural finds it, which is how people search")
    void findsATradeWrittenInThePlural() {
        // People search for a category of person, not for the label of a
        // taxonomy. "barbiers" answered nothing while "barbier" answered the
        // trade, and the same held for every trade whose label is singular.
        assertThat(search("photographies")).containsExactly("coiffeur-solo");
        assertThat(search("photographie")).containsExactly("coiffeur-solo");
    }

    @Test
    @DisplayName("Singularising only ever widens: nothing that matched stops matching")
    void losesNothingItUsedToFind() {
        // The stripped form is a PREFIX of the folded one, so every match the
        // longer word made, the shorter one makes too. This is the property
        // that made it safe to apply to all three matched columns at once.
        assertThat(search("tresses")).containsExactly("salon-fatou");
        assertThat(search("tresse")).containsExactly("salon-fatou");
        assertThat(search("FATOU")).containsExactly("salon-fatou");
    }

    @Test
    @DisplayName("A short label is not smuggled into an unrelated word")
    void doesNotMatchTheOtherWayRound() {
        // The obvious fix - also test whether the LABEL appears inside the
        // query - looks symmetric and is not. `position('spa' in 'espace')` is
        // 2, so searching for an "espace" would return massage parlours. A
        // rule that manufactures nonsense from real words is worse than one
        // that misses a plural, so the match stays one-directional.
        assertThat(search("espace")).isEmpty();
    }

    @Test
    @DisplayName("A ceiling keeps what somebody can actually afford to walk into")
    void filtersOnWhatItCostsToGetStarted() {
        // Matched against the same aggregate the card prints: the cheapest
        // VISIBLE active offering. Not "everything it sells is cheap" - that
        // is a question nobody asks, and it would hide a salon that does a
        // 5 000 GNF trim because it also does a wedding.
        long cheapest = given().when().get("/v1/providers")
                .then().statusCode(200)
                .extract().jsonPath().getLong("data.find { it.price_from }.price_from.amount_minor");

        assertThat(withCeiling(cheapest)).isNotEmpty();
        assertThat(withCeiling(cheapest - 1)).doesNotContainAnyElementsOf(withCeiling(cheapest));
    }

    @Test
    @DisplayName("A business with no visible price cannot answer, so it is not returned")
    void excludesWhatHasNoFloor() {
        // A card with no price, in a list filtered by price, is a card nobody
        // can judge. EXISTS over the visible offerings excludes it by
        // construction rather than by a rule somebody has to remember.
        fixtures.execute("UPDATE service_offerings SET price_visible = false");

        assertThat(withCeiling(100_000_000L)).isEmpty();
        // And with no ceiling asked for, the same businesses come back.
        assertThat(search("")).isNotEmpty();
    }

    private static List<String> withCeiling(long priceMax) {
        return given().queryParam("price_max", priceMax).when().get("/v1/providers")
                .then().statusCode(200)
                .extract().jsonPath().getList("data.slug", String.class);
    }

    @Test
    @DisplayName("A phrase finds what a substring never could")
    void readsASentence() {
        // Every comparison here was `stored LIKE '%typed%'`, a substring test:
        // it finds a word inside a label and can never find a label inside a
        // sentence. "salon de coiffure" answered nothing.
        // Across the NAME and the TRADE, which are one document here: "salon"
        // is the business and "coiffure" is what it does, and a vector per
        // column would have asked for both words in one of them and found
        // nothing.
        assertThat(search("salon de coiffure")).containsExactly("salon-fatou");
        // And within one field, which needs no concatenation.
        assertThat(search("salon fatou")).containsExactly("salon-fatou");
    }

    @Test
    @DisplayName("Typing three letters still answers, which full text alone cannot")
    void stillAnswersPartialTyping() {
        // Full text matches WHOLE stems, so "tress" gets nothing from it. The
        // trigram-indexed LIKE is the half that answers from the third letter,
        // which is why the two are OR'd rather than one replacing the other.
        assertThat(search("tress")).containsExactly("salon-fatou");
        assertThat(search("photograp")).containsExactly("coiffeur-solo");
    }

    @Test
    @DisplayName("An irregular plural works, which a trailing-s rule never could")
    void stemsRatherThanStrips() {
        // V055 strips a trailing s or x. French stemming is what actually
        // reduces "barbiers" and "chevaux" to the same root as their singular,
        // and it is why this is worth more than the rule it joins.
        assertThat(search("photographies")).containsExactly("coiffeur-solo");
    }

    @Test
    @DisplayName("A phrase across a business name and a SERVICE name is not served")
    void doesNotSpanTheOfferings() {
        // Said out loud rather than left to be discovered. Offerings are
        // matched on their own, so "tresses" finds the salon - but "salon de
        // tresses" asks for both words in one document and the offerings are
        // not in the concatenation, because aggregating them per row would be
        // a correlated subquery on the hot path. docs/BACKLOG.md carries it.
        assertThat(search("tresses")).containsExactly("salon-fatou");
        assertThat(search("salon de tresses")).isEmpty();
    }

    @Test
    @DisplayName("A word that answers nothing is written down, once per word")
    void remembersWhatItCouldNotAnswer() {
        assertThat(search("plombier")).isEmpty();
        assertThat(search("plombier")).isEmpty();
        assertThat(search("PLOMBIER")).isEmpty();

        // One row per distinct term, counted: the table is bounded by how many
        // different things people type rather than by how often, and the number
        // that matters - how many people wanted this - is the row itself.
        assertThat(fixtures.count(
                "SELECT times FROM search_misses WHERE term_folded = 'plombier'"))
                .isEqualTo(3);
        assertThat(fixtures.count("SELECT count(*) FROM search_misses")).isEqualTo(1);
    }

    @Test
    @DisplayName("An empty place is not a missing word")
    void doesNotFileAnEmptyFilterAsAMissingWord() {
        // A search narrowed to a commune with nobody in it is an empty
        // directory, not a vocabulary this platform lacks. Filing it would
        // bury the words that are, which is the one thing these rows exist to
        // make findable.
        given().queryParam("q", "tresses").queryParam("locality", "boke")
                .when().get("/v1/providers").then().statusCode(200)
                .body("data", org.hamcrest.Matchers.hasSize(0));

        assertThat(fixtures.count("SELECT count(*) FROM search_misses")).isZero();
    }
}
