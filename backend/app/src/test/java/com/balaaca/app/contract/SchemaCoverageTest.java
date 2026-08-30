package com.balaaca.app.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A column the schema declares and no line of code ever names.
 *
 * <p>This gate exists because almost every defect found in this project has had
 * the same shape, and none of them was a logic bug. {@code auto_confirm}
 * defaulted to true and had no reader, so every salon confirmed by hand.
 * {@code cancellation_deadline_minutes} was enforced nowhere.
 * {@code users.status} and {@code providers.status} were consulted nowhere, so
 * suspending an account revoked nothing. {@code audit_logs} had no Java at all.
 * {@code provider_staff.role} was written and read by nobody, so every employee
 * held full control. {@code provider_categories} had rows and no route.
 *
 * <p>Each of those cost far more to find than to fix, and every one of them is
 * mechanically detectable: the schema declares something the code does not
 * mention. The root cause is upstream - twelve migrations were written from a
 * specification before most of the code existed, so the schema described the
 * whole product while the code implemented a slice, and nothing measured the
 * distance. A schema grown column by column cannot drift, because each column
 * arrives with its reader.
 *
 * <p>The distance is measured here instead. A waiver is allowed and must carry a
 * reason, exactly as {@code osv-scanner.toml} does: the point is not zero
 * unnamed columns, it is that nobody adds one silently.
 */
class SchemaCoverageTest {

    private static final Path MIGRATIONS = Path.of("src/main/resources/db/migration");
    private static final Path WAIVERS = Path.of("src/test/resources/schema-coverage-waivers.txt");

    /** Sibling modules, from app/. */
    private static final List<Path> SOURCES = List.of(
            Path.of(".."), Path.of("..", "..", "notification-worker"));

    private static final Pattern CREATE_TABLE = Pattern.compile("^CREATE TABLE ([a-z_]+)");
    private static final Pattern COLUMN = Pattern.compile(
            "^ {4}([a-z_]+) +(uuid|text|varchar|int|bigint|boolean|timestamptz|date|time"
            + "|jsonb|numeric|smallint|citext|inet|bigserial)\\b");
    private static final Pattern ADD_COLUMN = Pattern.compile(
            "^ *ADD COLUMN ([a-z_]+) ", Pattern.MULTILINE);

    @Test
    @DisplayName("Every column the schema declares is named by some code, or waived with a reason")
    void noColumnIsDeclaredAndForgotten() {
        Map<String, String> declared = declaredColumns();
        String code = allSourceCode();
        Map<String, String> waived = waivers();

        assertThat(declared).as("no columns were parsed out of %s", MIGRATIONS).isNotEmpty();

        Map<String, String> forgotten = new TreeMap<>();
        declared.forEach((column, table) -> {
            String key = table + "." + column;
            if (!waived.containsKey(key) && !mentions(code, column)) {
                forgotten.put(key, "declared in " + table + " and named by no code");
            }
        });

        assertThat(forgotten)
                .as("a column nothing reads is a promise the schema makes and the code "
                    + "does not keep. Give it a reader, or add it to %s with a reason", WAIVERS)
                .isEmpty();
    }

    @Test
    @DisplayName("A table the application may write to is a table something writes to")
    void noTableIsGrantedAndNeverWritten() {
        // The other half of the same shape, and the half the column rule cannot
        // see. Three of the defects found in this project were not a forgotten
        // column but a forgotten ROW: nothing created a provider, so every
        // authenticated route answered 403; nothing created a second staff
        // member, so the any-staff booking machinery was unreachable; nothing
        // gave an employee an account, so the STAFF role existed only in tests.
        //
        // Each time, a table the application role could INSERT into had no
        // INSERT anywhere. That is one grep.
        String corpus = allSourceCode() + allMigrations();

        Map<String, String> unwritten = new TreeMap<>();
        for (String table : tablesTheApplicationMayWrite()) {
            if (!waivers().containsKey(table + ".*")
                    && !Pattern.compile("INSERT\\s+INTO\\s+" + Pattern.quote(table) + "\\b")
                            .matcher(corpus).find()) {
                unwritten.put(table, "granted INSERT and written by nothing");
            }
        }

        assertThat(unwritten)
                .as("a table nothing writes to is a capability nobody can reach. Write "
                    + "the path, or waive it in %s as <table>.* with a reason", WAIVERS)
                .isEmpty();
    }

    /** The one grant that names every table the application role may write. */
    private static Set<String> tablesTheApplicationMayWrite() {
        Matcher grant = Pattern.compile(
                "GRANT SELECT, INSERT, UPDATE, DELETE ON\\s+(.*?)\\nTO balaaca_app;",
                Pattern.DOTALL).matcher(allMigrations());

        Set<String> tables = new TreeSet<>();
        while (grant.find()) {
            for (String name : grant.group(1).replace("\n", " ").split(",")) {
                if (!name.isBlank()) {
                    tables.add(name.strip());
                }
            }
        }
        return tables;
    }

    private static String allMigrations() {
        StringBuilder all = new StringBuilder();
        migrations().forEach(f -> all.append(read(f)).append('\n'));
        return all.toString();
    }

    @Test
    @DisplayName("A waiver without a reason is not a waiver")
    void everyWaiverCarriesAReason() {
        waivers().forEach((key, reason) ->
                assertThat(reason)
                        .as("%s is waived with no reason; a waiver nobody has to justify "
                            + "is how a real gap becomes permanent", key)
                        .isNotBlank());
    }

    @Test
    @DisplayName("A waiver for a column that no longer exists is removed, not left behind")
    void noWaiverOutlivesItsColumn() {
        Set<String> declared = new TreeSet<>();
        declaredColumns().forEach((c, t) -> declared.add(t + "." + c));

        tablesTheApplicationMayWrite().forEach(t -> declared.add(t + ".*"));

        assertThat(waivers().keySet())
                .as("these waivers match nothing, which is how the file stops being read")
                .allSatisfy(key -> assertThat(declared).contains(key));
    }

    /**
     * Word-boundary, on the whole of the main sources at once. A column named
     * only inside a SQL string still counts - that IS how this codebase reads
     * columns, and a test that demanded a Java field would fail every adapter
     * in the project (see ADR-0008).
     */
    private static boolean mentions(String code, String column) {
        return Pattern.compile("\\b" + Pattern.quote(column) + "\\b").matcher(code).find();
    }

    /** Only columns inside a CREATE TABLE body, so plpgsql locals are not mistaken for one. */
    private static Map<String, String> declaredColumns() {
        Map<String, String> declared = new LinkedHashMap<>();
        for (Path file : migrations()) {
            String sql = read(file);
            String table = null;
            boolean inBody = false;

            for (String line : sql.split("\n")) {
                Matcher create = CREATE_TABLE.matcher(line);
                if (create.find()) {
                    table = create.group(1);
                    inBody = true;
                    continue;
                }
                if (inBody && line.startsWith(");")) {
                    inBody = false;
                    continue;
                }
                Matcher column = COLUMN.matcher(line);
                if (inBody && column.find()) {
                    declared.putIfAbsent(column.group(1), table);
                }
            }

            // ALTER TABLE x ADD COLUMN y - the shape a later migration uses.
            Matcher altered = Pattern.compile(
                    "ALTER TABLE ([a-z_]+)\\s+ADD COLUMN\\s+([a-z_]+)").matcher(sql);
            while (altered.find()) {
                declared.putIfAbsent(altered.group(2), altered.group(1));
            }
            Matcher more = ADD_COLUMN.matcher(sql);
            while (more.find()) {
                declared.putIfAbsent(more.group(1), lastTableAltered(sql, more.start()));
            }
        }
        declared.values().removeIf(java.util.Objects::isNull);
        return declared;
    }

    private static String lastTableAltered(String sql, int before) {
        Matcher m = Pattern.compile("ALTER TABLE ([a-z_]+)").matcher(sql.substring(0, before));
        String table = null;
        while (m.find()) {
            table = m.group(1);
        }
        return table;
    }

    private static List<Path> migrations() {
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            return files.filter(p -> p.toString().endsWith(".sql")).sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String allSourceCode() {
        StringBuilder all = new StringBuilder();
        for (Path root : SOURCES) {
            try (Stream<Path> files = Files.walk(root)) {
                files.filter(p -> p.toString().endsWith(".java"))
                        .filter(p -> p.toString().contains("/src/main/java/"))
                        .forEach(p -> all.append(read(p)).append('\n'));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return all.toString();
    }

    /** {@code table.column: reason}, one per line. Blank lines and # are ignored. */
    private static Map<String, String> waivers() {
        Map<String, String> waived = new LinkedHashMap<>();
        for (String line : read(WAIVERS).split("\n")) {
            String trimmed = line.strip();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            int colon = trimmed.indexOf(':');
            waived.put(colon < 0 ? trimmed : trimmed.substring(0, colon).strip(),
                       colon < 0 ? "" : trimmed.substring(colon + 1).strip());
        }
        return waived;
    }

    private static String read(Path path) {
        try {
            return Files.readString(path, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
