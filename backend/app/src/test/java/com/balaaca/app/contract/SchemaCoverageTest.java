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
 *
 * <p><strong>What counts as naming a column, and why it narrowed.</strong> It
 * used to be the word appearing anywhere in the main sources, and
 * {@code customers.blocked} passed that for six months on the strength of
 * {@code InstantRange blocked}, a local variable in the slot calculator that has
 * nothing to do with customers. Nothing wrote the column, no provider could
 * refuse a no-show, and the gate said the schema was covered.
 *
 * <p>So the corpus is now the STRING LITERALS of the main sources and nothing
 * else - which, by ADR-0008, is exactly the SQL this application executes. A
 * local variable, a record component, a Javadoc paragraph and a log message no
 * longer stand in for a reader. A column named only inside a SQL string still
 * counts, and must: that IS how this codebase reads columns, and a test that
 * demanded a Java field would fail every adapter in the project.
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
    private static final Pattern DROP_COLUMN = Pattern.compile(
            "DROP COLUMN\\s+(?:IF EXISTS\\s+)?([a-z_]+)");

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
     * Word-boundary, on the SQL the sources carry rather than on the sources.
     *
     * <p>The boundary alone was never enough. It has been here since the gate
     * was written and it caught nothing, because the words that stand in for a
     * column are whole words: {@code blocked} the local variable is
     * word-bounded, and so is every field, parameter and Javadoc mention that
     * happens to spell a column name. Only narrowing WHERE we look separates a
     * reader from a coincidence.
     */
    private static boolean mentions(String code, String column) {
        return Pattern.compile("\\b" + Pattern.quote(column) + "\\b").matcher(code).find();
    }

    /**
     * The string literals of one Java source, and nothing around them.
     *
     * <p>Scanned character by character rather than matched with a regular
     * expression, because the three things that must not be mistaken for a
     * literal - a comment, a char literal, an escaped quote - are exactly the
     * three a regular expression gets wrong. A comment carrying a quotation mark
     * would otherwise re-admit prose to the corpus, which is the whole class of
     * false cover this narrowing exists to remove.
     *
     * <p>An escape becomes a space rather than the character it names, so that
     * {@code "\nnotes"} cannot spell a column that is not there.
     */
    private static String literals(String java) {
        StringBuilder sql = new StringBuilder();
        int i = 0;
        int end = java.length();

        while (i < end) {
            char c = java.charAt(i);

            if (c == '/' && i + 1 < end && java.charAt(i + 1) == '/') {
                while (i < end && java.charAt(i) != '\n') {
                    i++;
                }
            } else if (c == '/' && i + 1 < end && java.charAt(i + 1) == '*') {
                int close = java.indexOf("*/", i + 2);
                i = close < 0 ? end : close + 2;
            } else if (c == '\'') {
                i++;
                while (i < end && java.charAt(i) != '\'') {
                    i += java.charAt(i) == '\\' ? 2 : 1;
                }
                i++;
            } else if (java.startsWith("\"\"\"", i)) {
                int close = java.indexOf("\"\"\"", i + 3);
                sql.append(java, i + 3, close < 0 ? end : close).append('\n');
                i = close < 0 ? end : close + 3;
            } else if (c == '"') {
                i++;
                while (i < end && java.charAt(i) != '"' && java.charAt(i) != '\n') {
                    if (java.charAt(i) == '\\') {
                        sql.append(' ');
                        i += 2;
                    } else {
                        sql.append(java.charAt(i));
                        i++;
                    }
                }
                sql.append('\n');
                i++;
            } else {
                i++;
            }
        }
        return sql.toString();
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

            // A dropped column is not declared any more, and demanding a reader
            // for one would ask the code to name something the database no
            // longer has. Applied per migration, in order, so a column dropped
            // and later added back is declared again. Removed only when the
            // recorded table matches the one being altered.
            Matcher dropped = DROP_COLUMN.matcher(sql);
            while (dropped.find()) {
                declared.remove(dropped.group(1), lastTableAltered(sql, dropped.start()));
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

    /** Every main source, reduced to the SQL and the strings it carries. */
    private static String allSourceCode() {
        StringBuilder all = new StringBuilder();
        for (Path root : SOURCES) {
            try (Stream<Path> files = Files.walk(root)) {
                files.filter(p -> p.toString().endsWith(".java"))
                        .filter(p -> p.toString().contains("/src/main/java/"))
                        .forEach(p -> all.append(literals(read(p))).append('\n'));
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
