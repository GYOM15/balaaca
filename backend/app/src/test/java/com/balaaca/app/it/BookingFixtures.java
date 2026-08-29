package com.balaaca.app.it;

import jakarta.enterprise.context.ApplicationScoped;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
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

    public static final UUID SALON_OFFERING = UUID.fromString("5e111111-0000-0000-0000-000000000001");
    public static final UUID HIDDEN_OFFERING = UUID.fromString("5e222222-0000-0000-0000-000000000001");
    public static final UUID SOLO_OFFERING = UUID.fromString("50103333-0000-0000-0000-000000000001");

    private final String jdbcUrl;

    public BookingFixtures(@ConfigProperty(name = "quarkus.datasource.jdbc.url") String jdbcUrl) {
        this.jdbcUrl = jdbcUrl;
    }

    public void reset() {
        run("TRUNCATE appointments, customers, service_offerings, provider_staff, providers CASCADE");
        run("""
            INSERT INTO providers (id, slug, business_name, country_code, published, status) VALUES
              ('%s','salon-fatou','Salon Fatou','GN',true,'ACTIVE'),
              ('%s','barbier-cache','Barbier Cache','GN',false,'PENDING'),
              ('%s','coiffeur-solo','Coiffeur Solo','GN',true,'ACTIVE')
            """.formatted(SALON, HIDDEN, SOLO));
        run("""
            INSERT INTO provider_staff (id, provider_id, display_name, role) VALUES
              ('a1a1a1a1-0000-0000-0000-000000000001','%s','Fatou','OWNER'),
              ('b1b1b1b1-0000-0000-0000-000000000001','%s','Cache','OWNER'),
              ('c3c3c3c3-0000-0000-0000-000000000001','%s','Solo','OWNER')
            """.formatted(SALON, HIDDEN, SOLO));
        run("""
            INSERT INTO service_offerings
              (id, provider_id, name, duration_minutes, buffer_before_minutes,
               buffer_after_minutes, price_amount_minor, price_currency) VALUES
              ('%s','%s','Tresses',60,15,10,150000,'GNF'),
              ('%s','%s','Coupe',30,0,0,50000,'GNF'),
              ('%s','%s','Coupe',60,0,0,80000,'GNF')
            """.formatted(SALON_OFFERING, SALON, HIDDEN_OFFERING, HIDDEN, SOLO_OFFERING, SOLO));
    }

    public long activeAppointments(UUID providerId) {
        return query("""
                SELECT count(*) FROM appointments
                 WHERE provider_id = '%s' AND status IN ('PENDING','CONFIRMED')
                """.formatted(providerId));
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
