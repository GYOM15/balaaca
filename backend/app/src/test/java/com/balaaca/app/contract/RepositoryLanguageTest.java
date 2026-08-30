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
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Everything a developer reads in this repository is English.
 *
 * <p>The rule is not new - {@code code-language} has said it since the pack was
 * written, down to the ADRs and the commit messages - and it was broken anyway,
 * in the README, in the docs and in every pull request description. A rule
 * nothing enforces is a rule that holds until somebody is in a hurry.
 *
 * <p>So this measures it, and the waiver list is the debt. Nothing new may be
 * written in French; what already is stays on the list until the translation
 * pass, and that pass is finished when the list is empty. Freezing the debt is
 * worth more than paying it today: it stops growing while the product is still
 * being built.
 *
 * <p>What a CUSTOMER reads is a different question and is not touched here.
 * User-facing copy is French first for the launch market, from an i18n
 * catalogue - the rule is that the repository is English, not that the product
 * is.
 */
class RepositoryLanguageTest {

    /** The repository root, from app/. */
    private static final Path ROOT = Path.of("..", "..");

    private static final Path WAIVERS =
            Path.of("src", "test", "resources", "language-waivers.txt");

    /**
     * Stopwords, word-bounded, because they are what a translation cannot leave
     * behind. A stray French noun in an English sentence is a word choice; six
     * of these in one file is a French document.
     */
    private static final Pattern FRENCH = Pattern.compile(
            "(?i)\\b(le|la|les|des|une|pour|qui|est|dans|avec|cette|sont|parce"
            + "|plutot|plutôt|donc|ainsi|celui|celle|leur|nous|vous|ce|ces|aux)\\b");

    /** Below this, a French word is a quotation or a name. Above it, a document. */
    private static final int THRESHOLD = 6;

    @Test
    @DisplayName("No prose in this repository is French, unless it is waived as debt")
    void everyDocumentIsEnglish() {
        Map<String, Integer> french = new TreeMap<>();
        Map<String, String> waived = waivers();

        for (Path file : documents()) {
            String relative = ROOT.relativize(file).toString();
            int hits = countFrench(read(file));
            if (hits >= THRESHOLD && !waived.containsKey(relative)) {
                french.put(relative, hits);
            }
        }

        assertThat(french)
                .as("everything a developer reads here is English - code-language has "
                    + "said so since the pack was written. Translate it, or add it to "
                    + "%s with a reason and a date it will be paid", WAIVERS)
                .isEmpty();
    }

    @Test
    @DisplayName("A waiver without a reason is not a waiver")
    void everyWaiverCarriesAReason() {
        waivers().forEach((file, reason) ->
                assertThat(reason)
                        .as("%s is waived with no reason", file)
                        .isNotBlank());
    }

    @Test
    @DisplayName("A waiver for a file that is already English is removed")
    void noWaiverOutlivesItsDebt() {
        Map<String, Integer> stillFrench = new LinkedHashMap<>();
        for (Path file : documents()) {
            stillFrench.put(ROOT.relativize(file).toString(), countFrench(read(file)));
        }

        // The translation pass is finished when this file is empty, and every
        // line removed from it is a line that can never come back unnoticed.
        assertThat(waivers().keySet())
                .as("these files are English now, or gone; the waiver is what makes "
                    + "the debt visible and a stale one hides that it was paid")
                .allSatisfy(waived ->
                        assertThat(stillFrench.getOrDefault(waived, 0))
                                .as("%s", waived)
                                .isGreaterThanOrEqualTo(THRESHOLD));
    }

    private static int countFrench(String text) {
        var matcher = FRENCH.matcher(text);
        var distinct = new TreeSet<String>();
        while (matcher.find()) {
            distinct.add(matcher.group().toLowerCase(java.util.Locale.ROOT));
        }
        return distinct.size();
    }

    /** Tracked Markdown only. Generated trees and dependencies are nobody's prose. */
    private static List<Path> documents() {
        try (Stream<Path> files = Files.walk(ROOT)) {
            return files.filter(p -> p.toString().endsWith(".md"))
                    .filter(p -> {
                        String s = p.toString();
                        return !s.contains("/target/") && !s.contains("/node_modules/")
                               && !s.contains("/.git/");
                    })
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** {@code path: reason}, one per line. Blank lines and # are ignored. */
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
