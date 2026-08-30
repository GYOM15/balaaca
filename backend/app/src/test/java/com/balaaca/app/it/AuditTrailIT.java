package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What the platform wrote down about what it did and what it refused.
 *
 * <p>audit_logs existed since V012 and no line of Java had ever named it. That
 * mattered less when there was nothing to record; it matters now that there is a
 * privilege boundary, because a boundary that does not write down its refusals
 * cannot answer the one question an operator will actually ask.
 *
 * <p>The hard part is not the insert - it is that a refusal ABORTS the
 * transaction it was refused in, so a naive audit row rolls back with it and the
 * trail records only the things that succeeded.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class AuditTrailIT {

    private static final String[] EVERYTHING = {
            "dashboard:read", "profile:write", "catalog:write",
            "schedule:write", "staff:write", "appointments:write"};

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        fixtures.seedEmployee();
    }

    @Test
    @DisplayName("A refusal survives the rollback it caused")
    @TestSecurity(user = BookingFixtures.EMPLOYEE_SUBJECT, roles = {
            "dashboard:read", "profile:write", "catalog:write",
            "schedule:write", "staff:write", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.EMPLOYEE_SUBJECT))
    void recordsARefusedAction() {
        given().contentType("application/json")
                .body("{\"display_name\":\"Complice\",\"bookable\":true,\"active\":true}")
                .when().post("/v1/staff").then().statusCode(403);

        assertThat(fixtures.auditTrail())
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.action()).isEqualTo("ACCESS_REFUSED");
                    assertThat(row.outcome()).isEqualTo("DENIED");
                    // Attributed, not anonymous: the tenant was still bound when
                    // this was written, which is why it is recorded in the
                    // interceptor and not in the exception mapper.
                    assertThat(row.actorRole()).isEqualTo("STAFF");
                    assertThat(row.providerId()).isEqualTo(BookingFixtures.SALON.toString());
                    assertThat(row.metadata()).contains("FORBIDDEN");
                });
    }

    @Test
    @DisplayName("A token belonging to nobody is recorded with no tenant and its subject")
    @TestSecurity(user = BookingFixtures.STRANGER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.STRANGER_SUBJECT))
    void recordsARefusalThatHasNoTenant() {
        given().when().get("/v1/provider-profile").then().statusCode(403);

        assertThat(fixtures.auditTrail())
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.outcome()).isEqualTo("DENIED");
                    // No membership resolved, so there is no tenant and no
                    // account - the subject is the only thing identifying who
                    // knocked, and it is exactly what an operator wants.
                    assertThat(row.providerId()).isEmpty();
                    assertThat(row.actorRole()).isEmpty();
                    assertThat(row.metadata()).contains(BookingFixtures.STRANGER_SUBJECT);
                });
    }

    @Test
    @DisplayName("Publishing and unpublishing are both on the trail")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {
            "dashboard:read", "profile:write", "catalog:write",
            "schedule:write", "staff:write", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void recordsTheProfileChange() {
        given().contentType("application/json")
                .body("""
                      {"business_name":"Salon Fatou","timezone":"Africa/Conakry",
                       "published":false}
                      """)
                .when().put("/v1/provider-profile").then().statusCode(200);

        assertThat(fixtures.auditTrail())
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.action()).isEqualTo("PROVIDER_PROFILE_UPDATED");
                    assertThat(row.outcome()).isEqualTo("SUCCESS");
                    assertThat(row.actorRole()).isEqualTo("OWNER");
                    // jsonb normalises the document, so the assertion is on
                    // the pair and not on the exact bytes we sent.
                    assertThat(row.metadata()).contains("\"published\"").contains("\"false\"");
                });
    }

    @Test
    @DisplayName("Composing the team is on the trail, with what changed")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {
            "dashboard:read", "profile:write", "catalog:write",
            "schedule:write", "staff:write", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void recordsTeamChanges() {
        String id = given().contentType("application/json")
                .body("{\"display_name\":\"Aissatou\",\"bookable\":true,\"active\":true}")
                .when().post("/v1/staff").then().statusCode(201)
                .extract().jsonPath().getString("staff_id");

        given().contentType("application/json")
                .body("{\"display_name\":\"Aissatou\",\"bookable\":false,\"active\":true}")
                .when().put("/v1/staff/" + id).then().statusCode(200);

        assertThat(fixtures.auditTrail()).extracting(BookingFixtures.AuditRow::action)
                .containsExactly("STAFF_MEMBER_ADDED", "STAFF_MEMBER_CHANGED");
        assertThat(fixtures.auditTrail().get(1).metadata())
                .contains("\"bookable\"").contains("\"false\"");
    }

    @Test
    @DisplayName("A signup has no tenant, so it is a platform row")
    @TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
    void recordsARegistrationWithoutATenant() {
        given().contentType("application/json")
                .body("""
                      {"slug":"salon-awa","business_name":"Salon Awa"}
                      """)
                .when().post("/v1/providers").then().statusCode(201);

        assertThat(fixtures.auditTrail())
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.action()).isEqualTo("PROVIDER_REGISTERED");
                    // No tenant is bound during a signup - that is the whole
                    // reason V014 exists - so the business it created is in the
                    // metadata rather than in provider_id.
                    assertThat(row.providerId()).isEmpty();
                    assertThat(row.metadata()).contains("salon-awa");
                });
    }

    @Test
    @DisplayName("An ordinary read writes nothing: a trail of everything is a trail of nothing")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void recordsNothingForAPlainRead() {
        given().when().get("/v1/provider-profile").then().statusCode(200);
        given().when().get("/v1/staff").then().statusCode(200);

        assertThat(fixtures.auditTrail()).isEmpty();
    }

    @Test
    @DisplayName("A 404 is an answer, not a refusal")
    void recordsNothingForAnUnknownPublicPage() {
        given().when().get("/v1/providers/personne-du-tout").then().statusCode(404);

        assertThat(fixtures.auditTrail()).isEmpty();
    }
}
