package com.balaaca.app.it;

import jakarta.enterprise.context.ApplicationScoped;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Seeds providers, staff and offerings for the integration tests.
 *
 * <p>Fixtures connect as the superuser, not as balaaca_app. That is not a
 * shortcut but a necessity: balaaca_app owns no table, so it cannot TRUNCATE,
 * and RLS would reject an INSERT into providers before any tenant exists to
 * bind. The application under test never gets this connection - it always runs
 * as balaaca_app, through HTTP, with RLS fully in force.
 */
@ApplicationScoped
public class BookingFixtures {

    public static final UUID SALON = UUID.fromString("11111111-1111-1111-1111-111111111111");
    public static final UUID HIDDEN = UUID.fromString("22222222-2222-2222-2222-222222222222");
    public static final UUID SOLO = UUID.fromString("33333333-3333-3333-3333-333333333333");

    /** Keycloak subjects. The staff row is what ties one to a provider. */
    public static final String SALON_SUBJECT = "kc-salon-fatou";
    public static final String SOLO_SUBJECT = "kc-coiffeur-solo";
    public static final String STRANGER_SUBJECT = "kc-nobody";
    /** Nobody at all: no users row either, which is what a real signup looks like. */
    public static final String NEWCOMER_SUBJECT = "kc-nouveau";
    /** An employee at the salon. Belongs there, and does not own it. */
    public static final String EMPLOYEE_SUBJECT = "kc-employee";

    public static final UUID SALON_OWNER_STAFF =
            UUID.fromString("a1a1a1a1-0000-0000-0000-000000000001");
    public static final UUID SALON_EMPLOYEE_STAFF =
            UUID.fromString("a4a4a4a4-0000-0000-0000-000000000001");

    public static final String CATEGORY = "coiffure";

    public static final UUID SALON_OFFERING = UUID.fromString("5e111111-0000-0000-0000-000000000001");
    public static final UUID HIDDEN_OFFERING = UUID.fromString("5e222222-0000-0000-0000-000000000001");
    public static final UUID SOLO_OFFERING = UUID.fromString("50103333-0000-0000-0000-000000000001");

    private final String jdbcUrl;

    public BookingFixtures(@ConfigProperty(name = "quarkus.datasource.jdbc.url") String jdbcUrl) {
        this.jdbcUrl = jdbcUrl;
    }

    public void reset() {
        run("""
            TRUNCATE notifications, appointments, customers, availability_overrides,
                     availability_rules, service_offerings, provider_staff, providers,
                     audit_logs, users CASCADE
            """);
        // The trades come from V016 and are NOT truncated: the tests browse the
        // taxonomy the product actually ships. Only the withdrawn one is local -
        // naming a retired trade must be refused like any unknown one, not
        // quietly stored as none.
        run("""
            INSERT INTO provider_categories (id, slug, label_fr, active) VALUES
              ('ca7e6047-0000-0000-0000-000000000002','retire','Retire',false)
            ON CONFLICT (slug) DO NOTHING
            """);
        // A user with no staff row exists on purpose: a valid token whose
        // subject belongs to nobody here must be told 403, not handed an empty
        // agenda that looks like a working account.
        run("""
            INSERT INTO users (id, keycloak_user_id, display_name) VALUES
              ('d1d1d1d1-0000-0000-0000-000000000001','%s','Fatou'),
              ('d2d2d2d2-0000-0000-0000-000000000001','%s','Solo'),
              ('d3d3d3d3-0000-0000-0000-000000000001','%s','Personne')
            """.formatted(SALON_SUBJECT, SOLO_SUBJECT, STRANGER_SUBJECT));
        // The salon vets its bookings and the solo barber does not, so both
        // sides of auto_confirm are exercised: a booking that arrives PENDING
        // and one that arrives CONFIRMED. The column defaults to true, so
        // leaving it out here would have quietly made every test the second
        // case - which is how it went unnoticed that nothing read it at all.
        //
        // Only the salon publishes a way to be reached. coiffeur-solo deliberately
        // does not: a provider with no contact must still be bookable, and the
        // staff notice is simply not planned.
        run("""
            INSERT INTO providers (id, slug, business_name, country_code, published, status,
                                   whatsapp_phone_e164, auto_confirm) VALUES
              ('%s','salon-fatou','Salon Fatou','GN',true,'ACTIVE','+224622999001',false),
              ('%s','barbier-cache','Barbier Cache','GN',false,'PENDING',NULL,false),
              ('%s','coiffeur-solo','Coiffeur Solo','GN',true,'ACTIVE',NULL,true)
            """.formatted(SALON, HIDDEN, SOLO));
        run("""
            INSERT INTO provider_staff (id, provider_id, user_id, display_name, role) VALUES
              ('a1a1a1a1-0000-0000-0000-000000000001','%s','d1d1d1d1-0000-0000-0000-000000000001','Fatou','OWNER'),
              ('b1b1b1b1-0000-0000-0000-000000000001','%s',NULL,'Cache','OWNER'),
              ('c3c3c3c3-0000-0000-0000-000000000001','%s','d2d2d2d2-0000-0000-0000-000000000001','Solo','OWNER')
            """.formatted(SALON, HIDDEN, SOLO));
        // Monday to Saturday, 08:00 to 20:00 local. Without these every booking
        // is now correctly refused as outside the provider's declared hours,
        // which is the point of this increment.
        for (int day = 1; day <= 6; day++) {
            run("""
                INSERT INTO availability_rules
                  (id, provider_id, staff_id, day_of_week, start_time, end_time) VALUES
                  (gen_random_uuid(),'%s','a1a1a1a1-0000-0000-0000-000000000001',%d,'08:00','20:00'),
                  (gen_random_uuid(),'%s','c3c3c3c3-0000-0000-0000-000000000001',%d,'08:00','20:00')
                """.formatted(SALON, day, SOLO, day));
        }
        run("""
            INSERT INTO service_offerings
              (id, provider_id, name, duration_minutes, buffer_before_minutes,
               buffer_after_minutes, price_amount_minor, price_currency) VALUES
              ('%s','%s','Tresses',60,15,10,150000,'GNF'),
              ('%s','%s','Coupe',30,0,0,50000,'GNF'),
              ('%s','%s','Coupe',60,0,0,80000,'GNF')
            """.formatted(SALON_OFFERING, SALON, HIDDEN_OFFERING, HIDDEN, SOLO_OFFERING, SOLO));
    }

    /** One line of the audit trail, as an operator would read it. */
    public record AuditRow(String action, String entityType, String outcome,
                           String actorRole, String providerId, String metadata) {
    }

    public List<AuditRow> auditTrail() {
        String sql = """
                SELECT action, entity_type, outcome, coalesce(actor_role,''),
                       coalesce(provider_id::text,''), metadata::text
                  FROM audit_logs ORDER BY id
                """;
        List<AuditRow> rows = new ArrayList<>();
        try (Connection c = admin(); Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            while (rs.next()) {
                rows.add(new AuditRow(rs.getString(1), rs.getString(2), rs.getString(3),
                                      rs.getString(4), rs.getString(5), rs.getString(6)));
            }
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
        return rows;
    }

    /** One outbox row, as the worker would read it. */
    public record NotificationRow(String kind, String recipientKind, String toPhone,
                                  String dedupeKey, String status, String payload) {
    }

    public List<NotificationRow> notifications(UUID providerId) {
        String sql = """
                SELECT kind, recipient_kind, coalesce(to_phone_e164,''), dedupe_key,
                       status, payload::text
                  FROM notifications WHERE provider_id = '%s'
                 ORDER BY scheduled_at, kind
                """.formatted(providerId);
        List<NotificationRow> rows = new ArrayList<>();
        try (Connection c = admin(); Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            while (rs.next()) {
                rows.add(new NotificationRow(rs.getString(1), rs.getString(2), rs.getString(3),
                                             rs.getString(4), rs.getString(5), rs.getString(6)));
            }
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
        return rows;
    }

    public long activeAppointments(UUID providerId) {
        return query("""
                SELECT count(*) FROM appointments
                 WHERE provider_id = '%s' AND status IN ('PENDING','CONFIRMED')
                """.formatted(providerId));
    }

    /**
     * An employee with an account at the salon, added on request rather than to
     * the shared decor.
     *
     * <p>A second bookable member is not a neutral addition: the booking path
     * resolves "any available staff" by retrying against the next candidate, so
     * a salon with two chairs answers 201 where a salon with one answers 409.
     * Putting this row in reset() silently rewrote four double-booking tests
     * into tests of something else.
     */
    public void seedEmployee() {
        run("""
            INSERT INTO users (id, keycloak_user_id, display_name)
                 VALUES ('d4d4d4d4-0000-0000-0000-000000000001','%s','Mariama');
            INSERT INTO provider_staff (id, provider_id, user_id, display_name, role)
                 VALUES ('%s','%s','d4d4d4d4-0000-0000-0000-000000000001','Mariama','STAFF')
            """.formatted(EMPLOYEE_SUBJECT, SALON_EMPLOYEE_STAFF, SALON));
    }

    /**
     * An unclaimed chair carrying a known invitation code.
     *
     * <p>Minted in SQL rather than through the API because redeeming it needs a
     * DIFFERENT subject from the one that minted it, and @TestSecurity binds one
     * per method. The minting path has its own tests.
     */
    public void seedInvitation(String code) {
        run("""
            INSERT INTO provider_staff (id, provider_id, user_id, display_name, role,
                                        invitation_token, invitation_expires_at)
                 VALUES ('a5a5a5a5-0000-0000-0000-000000000001','%s',NULL,'Mariama','STAFF',
                         '%s', now() + interval '7 days')
            """.formatted(SALON, code));
    }

    /** Every customer phone this provider has stored, as E.164. */
    public List<String> customerPhones(UUID providerId) {
        List<String> phones = new ArrayList<>();
        String sql = "SELECT phone_e164 FROM customers WHERE provider_id = '%s' ORDER BY 1"
                .formatted(providerId);
        try (Connection c = admin(); Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            while (rs.next()) {
                phones.add(rs.getString(1));
            }
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
        return phones;
    }

    /** Arbitrary SQL, for the one-off row a single test needs and no other. */
    public void execute(String sql) {
        run(sql);
    }

    /** Closes a single date for the salon, to exercise an override. */
    public void closeSalonOn(String isoDate) {
        run("""
            INSERT INTO availability_overrides
              (id, provider_id, staff_id, override_date, kind, reason) VALUES
              (gen_random_uuid(),'%s','a1a1a1a1-0000-0000-0000-000000000001','%s','CLOSED','ferie')
            """.formatted(SALON, isoDate));
    }

    public long distinctStaffBooked(UUID providerId) {
        return query("""
                SELECT count(DISTINCT staff_id) FROM appointments
                 WHERE provider_id = '%s' AND status IN ('PENDING','CONFIRMED')
                """.formatted(providerId));
    }

    private long query(String sql) {
        try (Connection c = admin(); Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private void run(String sql) {
        try (Connection c = admin(); Statement s = c.createStatement()) {
            s.execute(sql);
        } catch (SQLException e) {
            throw new IllegalStateException("fixture failed: " + e.getMessage(), e);
        }
    }

    private Connection admin() throws SQLException {
        return DriverManager.getConnection(jdbcUrl, "postgres", "test");
    }
}
