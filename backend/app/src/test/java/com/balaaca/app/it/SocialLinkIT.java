package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Where else a business can be found, and what the platform will not let it
 * claim.
 *
 * <p>The interesting tests here are not the round trip. They are the two that
 * hold a security property: that nothing a provider can store composes to
 * anything but an {@code https} address, and that the pattern the CONTRACT
 * publishes and the CHECK the DATABASE enforces agree about what a handle is.
 * Those are two places that must say the same thing, which is the defect class
 * this repository keeps paying for, so they are made to say it in front of a
 * test rather than by assertion in a comment.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class SocialLinkIT {

    private static final String PROFILE = "/v1/provider-profile";
    private static final String PUBLIC_PAGE = "/v1/providers/salon-fatou";

    /**
     * Values a provider must never be able to store, and why each one is here.
     *
     * <p>Not an arbitrary list: every entry is a way an {@code href} has been
     * turned into something other than a link to the place its icon promised.
     */
    private static final List<String> HOSTILE = List.of(
            "javascript:alert(1)",          // the classic, straight into href
            "JavaScript:alert(1)",          // the same, past a lowercase check
            "data:text/html;base64,PHM+",   // a whole document as a link
            "vbscript:msgbox(1)",           // the forgotten sibling
            "//evil.example",               // protocol-relative: keeps the scheme
            "/../../admin",                 // climbing out of the path
            "..",                           // the same, minimally
            "a/../../b",                    // and hidden in the middle
            "http://evil.example",          // not https
            "https://x@evil.example",       // userinfo: the host is NOT x
            "https://evil.example?a=1",     // a query on a link we vouch for
            "https://evil.example#f",       // a fragment, same argument
            "https://evil example",         // whitespace inside a host
            "salon awa",                    // whitespace in a handle
            "salon?x=1",                    // a query smuggled into a path
            "salon#x",                      // a fragment, likewise
            "salon\"onmouseover=alert(1)",  // breaking out of the attribute
            "salon<script>",                // breaking out of the element
            "",                             // nothing at all
            " ");                           // nothing, dressed up

    /** One well formed value per network, and the address each must compose to. */
    private static final List<String[]> GOOD = List.of(
            new String[] {"FACEBOOK",  "salon.fatou",    "https://www.facebook.com/salon.fatou"},
            new String[] {"INSTAGRAM", "salon_fatou",    "https://www.instagram.com/salon_fatou"},
            new String[] {"TIKTOK",    "@salonfatou",    "https://www.tiktok.com/@salonfatou"},
            new String[] {"YOUTUBE",   "channel/UC1234", "https://www.youtube.com/channel/UC1234"},
            new String[] {"LINKEDIN",  "company/salon",  "https://www.linkedin.com/company/salon"},
            new String[] {"X",         "salonfatou",     "https://x.com/salonfatou"},
            new String[] {"WEBSITE",   "https://salon-fatou.gn/rendez-vous",
                                       "https://salon-fatou.gn/rendez-vous"});

    private static final String[] SCOPES = {"dashboard:read", "profile:write"};

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String profileWith(String links) {
        return """
               {"business_name":"Salon Fatou","timezone":"Africa/Conakry",
                "published":true,"links":[%s]}
               """.formatted(links);
    }

    private static String link(String kind, String value) {
        return "{\"kind\":\"%s\",\"value\":\"%s\"}".formatted(kind, value);
    }

    @Nested
    @DisplayName("What a provider publishes")
    class Published {

        @Test
        @DisplayName("The handles go in and the addresses come out")
        @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "profile:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
        void storesHandlesAndPublishesUrls() {
            String body = GOOD.stream().map(g -> link(g[0], g[1]))
                    .reduce((a, b) -> a + "," + b).orElseThrow();

            given().contentType("application/json").body(profileWith(body))
                    .when().put(PROFILE).then().statusCode(200)
                    // The owner's own read gives back what was typed, because it
                    // is what the form has to put back in its fields.
                    .body("links", hasSize(7))
                    .body("links.find { it.kind == 'TIKTOK' }.value", equalTo("@salonfatou"));
        }

        @Test
        @DisplayName("A customer gets an address, never a handle")
        @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "profile:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
        void composesTheUrlOnTheWayOut() {
            String body = GOOD.stream().map(g -> link(g[0], g[1]))
                    .reduce((a, b) -> a + "," + b).orElseThrow();
            given().contentType("application/json").body(profileWith(body))
                    .when().put(PROFILE).then().statusCode(200);

            var page = given().when().get(PUBLIC_PAGE).then().statusCode(200).extract();
            for (String[] good : GOOD) {
                assertThat(page.<String>path("links.find { it.kind == '%s' }.url".formatted(good[0])))
                        .as("%s composes to its own network", good[0])
                        .isEqualTo(good[2]);
            }
            // Ordered by network, so the preview and the page cannot differ.
            assertThat(page.<List<String>>path("links.kind"))
                    .isSorted();
        }

        @Test
        @DisplayName("A save that omits them clears them, like every other field")
        @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "profile:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
        void replacesTheWholeSet() {
            given().contentType("application/json")
                    .body(profileWith(link("FACEBOOK", "salon.fatou") + ","
                                      + link("X", "salonfatou")))
                    .when().put(PROFILE).then().statusCode(200).body("links", hasSize(2));

            given().contentType("application/json")
                    .body(profileWith(link("FACEBOOK", "salon.autre")))
                    .when().put(PROFILE).then().statusCode(200)
                    .body("links", hasSize(1))
                    .body("links[0].value", equalTo("salon.autre"));

            given().contentType("application/json")
                    .body("""
                          {"business_name":"Salon Fatou","timezone":"Africa/Conakry",
                           "published":true}
                          """)
                    .when().put(PROFILE).then().statusCode(200).body("links", hasSize(0));
        }

        @Test
        @DisplayName("One account per network, and the refusal says which")
        @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "profile:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
        void refusesTheSameNetworkTwice() {
            given().contentType("application/json")
                    .body(profileWith(link("INSTAGRAM", "salon.un") + ","
                                      + link("INSTAGRAM", "salon.deux")))
                    .when().put(PROFILE).then().statusCode(400)
                    .body("code", equalTo("VALIDATION_FAILED"))
                    .body("title", equalTo("This network is listed twice"));
        }

        @Test
        @DisplayName("A refused link leaves the rest of the profile alone")
        @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "profile:write"})
        @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
        void rollsBackTheWholeSave() {
            given().contentType("application/json")
                    .body("""
                          {"business_name":"Nom Change","timezone":"Africa/Conakry",
                           "published":true,"links":[%s]}
                          """.formatted(link("FACEBOOK", "salon awa")))
                    .when().put(PROFILE).then().statusCode(400);

            // A half-written profile is worse than a refused one: the name must
            // not have moved.
            given().when().get(PROFILE).then().statusCode(200)
                    .body("business_name", equalTo("Salon Fatou"))
                    .body("links", hasSize(0));
        }
    }

    @Nested
    @DisplayName("What the platform will not store")
    class Refused {

        /**
         * The security property, stated as a test rather than as a comment: for
         * every network and every hostile value, the DATABASE refuses. Not the
         * application - the write goes in as {@code balaaca_app} with the tenant
         * bound, exactly as the running product does, so what is measured here
         * is the constraint and not a Java branch in front of it.
         */
        @Test
        @DisplayName("No network accepts anything that could leave its own site")
        void theDatabaseRefusesEveryHostileValue() {
            for (String kind : List.of("FACEBOOK", "INSTAGRAM", "TIKTOK", "YOUTUBE",
                                       "LINKEDIN", "X", "WEBSITE")) {
                for (String value : HOSTILE) {
                    long written = fixtures.writeAsProvider(BookingFixtures.SALON, """
                            INSERT INTO provider_links (id, provider_id, kind, value)
                            VALUES (gen_random_uuid(), '%s', '%s', %s)
                            """.formatted(BookingFixtures.SALON, kind, quoted(value)));
                    assertThat(written)
                            .as("%s must not accept %s", kind, quoted(value))
                            .isEqualTo(-1);
                }
            }
        }

        @Test
        @DisplayName("A network is not a free text field either")
        void theDatabaseRefusesAnUnknownNetwork() {
            assertThat(fixtures.writeAsProvider(BookingFixtures.SALON, """
                    INSERT INTO provider_links (id, provider_id, kind, value)
                    VALUES (gen_random_uuid(), '%s', 'MYSPACE', 'salon')
                    """.formatted(BookingFixtures.SALON))).isEqualTo(-1);
        }

        /**
         * The other half: the pattern the contract publishes must refuse
         * everything the database refuses, or a client is told a value is well
         * formed and then gets a 400 for it.
         *
         * <p>The pattern is READ OUT OF the contract rather than copied here.
         * A copy would be a third place holding one rule, and it would be the
         * copy that goes stale.
         */
        @Test
        @DisplayName("The published pattern refuses everything the database does")
        void theContractAgreesWithTheDatabase() throws IOException {
            Pattern published = Pattern.compile(publishedHandlePattern());

            for (String value : HOSTILE) {
                assertThat(published.matcher(value).matches())
                        .as("the contract must not admit %s", quoted(value))
                        .isFalse();
            }
            for (String[] good : GOOD) {
                assertThat(published.matcher(good[1]).matches())
                        .as("the contract must admit %s for %s", good[1], good[0])
                        .isTrue();
            }
        }

        /** The `pattern` of `SocialHandle.value`, taken from the one contract. */
        private static String publishedHandlePattern() throws IOException {
            String spec = Files.readString(
                    Path.of("src", "main", "resources", "META-INF", "openapi.yaml"),
                    StandardCharsets.UTF_8);
            int schema = spec.indexOf("\n    SocialHandle:\n");
            assertThat(schema).as("SocialHandle is in the contract").isNotNegative();
            int open = spec.indexOf("pattern: '", schema);
            assertThat(open).as("SocialHandle.value declares a pattern").isNotNegative();
            open += "pattern: '".length();
            return spec.substring(open, spec.indexOf('\'', open));
        }
    }

    @Nested
    @DisplayName("Whose links these are")
    class Tenancy {

        @Test
        @DisplayName("A salon cannot put a link on somebody else's page")
        void refusesAWriteAcrossTenants() {
            // Bound to the salon, naming the other provider's id: the WITH CHECK
            // is what refuses, not a predicate this test wrote.
            assertThat(fixtures.writeAsProvider(BookingFixtures.SALON, """
                    INSERT INTO provider_links (id, provider_id, kind, value)
                    VALUES (gen_random_uuid(), '%s', 'FACEBOOK', 'pas.a.moi')
                    """.formatted(BookingFixtures.SOLO))).isEqualTo(-1);
        }

        @Test
        @DisplayName("An unpublished business keeps its links to itself")
        void hidesTheLinksOfAnUnpublishedPage() {
            fixtures.execute("""
                    INSERT INTO provider_links (id, provider_id, kind, value)
                    VALUES (gen_random_uuid(), '%s', 'FACEBOOK', 'cache')
                    """.formatted(BookingFixtures.HIDDEN));

            // The page itself is not on the public path, which is the whole
            // answer: there is no route that reaches those rows.
            given().when().get("/v1/providers/barbier-cache").then().statusCode(404);
        }

        @Test
        @DisplayName("A page with no links says so with an empty list, not a null")
        void publishesAnEmptyListRatherThanNothing() {
            given().when().get(PUBLIC_PAGE).then().statusCode(200)
                    .body("links", hasSize(0))
                    .body("links", org.hamcrest.Matchers.not(nullValue()));
        }
    }

    /** SQL literal quoting for a value this test is deliberately hostile with. */
    private static String quoted(String value) {
        return "'" + value.replace("'", "''") + "'";
    }
}
