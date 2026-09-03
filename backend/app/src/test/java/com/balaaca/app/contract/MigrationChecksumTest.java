package com.balaaca.app.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Stream;
import java.util.zip.CRC32;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A migration that has shipped is history, and history is not edited.
 *
 * <p>Flyway records a checksum for every migration it applies and refuses to
 * start when the file no longer matches. That is the right behaviour and it is
 * not the problem. The problem is WHERE it is discovered: not in the build, not
 * in review, but on the first machine that already had the old version - which
 * in practice is a developer's laptop or, later, the one server carrying real
 * data.
 *
 * <p>This is not a hypothetical. {@code V016} was edited to translate a single
 * comment from French to English. Nothing objected: the diff was one line and it
 * made the repository more compliant, not less. The API then could not start for
 * hours on the machine whose database predated it, while the process that was
 * still up served classes from jars that had been replaced underneath it - so
 * the visible symptom was not a migration error at all, but a CDI proxy calling
 * a constructor that no longer existed, surfacing as {@code 500 INTERNAL_ERROR}
 * on sign-in.
 *
 * <p>CI could not have caught it. CI starts from an empty container every time,
 * where a rewritten migration is simply the only version that has ever existed
 * and validation passes. Only a database older than the edit can tell the
 * difference, and CI does not have one. So the record moves into the repository:
 * {@code migration-checksums.txt} is that older database's memory, and this test
 * is the thing that consults it.
 *
 * <p>It deliberately checks the FILE NAME too. Flyway derives a migration's
 * description from the name, so renaming {@code V016__seed_provider_categories}
 * breaks an existing database exactly as editing its body does, and a test that
 * only compared checksums would let a rename through.
 */
class MigrationChecksumTest {

    private static final Path MIGRATIONS =
            Path.of("src", "main", "resources", "db", "migration");

    private static final Path RECORDED =
            Path.of("src", "test", "resources", "migration-checksums.txt");

    @Test
    @DisplayName("no migration that has shipped has been edited or renamed")
    void migrationsAreImmutable() throws IOException {
        Map<String, Integer> recorded = readRecorded();
        Map<String, Integer> present = readPresent();

        // Reported as three separate findings rather than one map comparison:
        // "expected X but was Y" over fifty entries names the difference and not
        // the mistake, and the three mistakes have three different remedies.
        Map<String, String> changed = new TreeMap<>();
        for (Map.Entry<String, Integer> file : present.entrySet()) {
            Integer was = recorded.get(file.getKey());
            if (was != null && !was.equals(file.getValue())) {
                changed.put(file.getKey(), "recorded " + was + ", now " + file.getValue());
            }
        }
        assertThat(changed)
                .as("""
                    A migration that has already run somewhere was edited. Nothing \
                    can un-run it: the databases that applied it keep what it did, \
                    and Flyway will refuse to start against them. Revert the file. \
                    If the change is one the schema genuinely needs, it is the next \
                    migration, not this one.""")
                .isEmpty();

        Map<String, Integer> unrecorded = new TreeMap<>(present);
        unrecorded.keySet().removeAll(recorded.keySet());
        assertThat(unrecorded)
                .as("""
                    A new migration is not in src/test/resources/\
                    migration-checksums.txt. Add the line printed here, in this \
                    same commit - a migration recorded later is a migration \
                    nothing was watching in between.""")
                .isEmpty();

        Map<String, Integer> vanished = new TreeMap<>(recorded);
        vanished.keySet().removeAll(present.keySet());
        assertThat(vanished)
                .as("""
                    A recorded migration is gone from db/migration. Deleting or \
                    renaming one is the same breakage as editing it: Flyway takes \
                    its description from the file name, so an existing database \
                    stops matching either way.""")
                .isEmpty();
    }

    /**
     * Flyway's own checksum, reproduced.
     *
     * <p>CRC32 over each line's UTF-8 bytes with the line separators left out,
     * which is what makes the value the same on a machine that checked the files
     * out with CRLF. Verified against a live {@code flyway_schema_history}: all
     * forty-nine rows agree, so this is the algorithm and not an approximation
     * of it.
     */
    private static int checksum(Path file) {
        CRC32 crc = new CRC32();
        try (BufferedReader lines = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line = lines.readLine();
            if (line != null) {
                // A byte-order mark belongs to the file and not to the first
                // line, and Flyway drops it before counting.
                if (!line.isEmpty() && line.charAt(0) == '﻿') {
                    line = line.substring(1);
                }
                do {
                    crc.update(line.getBytes(StandardCharsets.UTF_8));
                } while ((line = lines.readLine()) != null);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("could not read " + file, e);
        }
        return (int) crc.getValue();
    }

    private static Map<String, Integer> readPresent() throws IOException {
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            return files
                    .filter(p -> p.getFileName().toString().endsWith(".sql"))
                    .sorted()
                    .collect(LinkedHashMap::new,
                             (m, p) -> m.put(p.getFileName().toString(), checksum(p)),
                             LinkedHashMap::putAll);
        }
    }

    private static Map<String, Integer> readRecorded() throws IOException {
        Map<String, Integer> recorded = new LinkedHashMap<>();
        for (String line : Files.readAllLines(RECORDED, StandardCharsets.UTF_8)) {
            String trimmed = line.strip();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
            int space = trimmed.lastIndexOf(' ');
            recorded.put(trimmed.substring(0, space).strip(),
                         Integer.valueOf(trimmed.substring(space + 1).strip()));
        }
        return recorded;
    }
}
