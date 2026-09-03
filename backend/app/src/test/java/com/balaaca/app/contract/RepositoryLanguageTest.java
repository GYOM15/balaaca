package com.balaaca.app.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
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
 * <p>It measured Markdown only, which is why the whole frontend could be
 * commented in French and nothing ever objected. It now measures code comments
 * too, in the two corpora below, and the debt it froze has been paid: the
 * waiver list is empty.
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
    private static final String STOPWORDS =
            "le|la|les|des|une|pour|qui|est|dans|avec|cette|sont|parce"
            + "|plutot|plutôt|donc|ainsi|celui|celle|leur|nous|vous|ce|ces|aux";

    private static final Pattern FRENCH = Pattern.compile("(?i)\\b(" + STOPWORDS + ")\\b");

    /**
     * The same words, plus the ones only a short passage needs.
     *
     * <p>A wider net than the file-scale one, and it can afford to be: quoted
     * text is dropped before a comment is counted, which is where every false
     * positive came from. It has to be, too - a whole French sentence in a
     * migration comment scored one against the list above, because this
     * repository writes French without accents and in few words.
     *
     * <p>The two lists stay separate rather than merging into the wider one.
     * Merged, {@code code-language}'s own skill file crosses the file-scale
     * threshold on the French examples it exists to teach.
     */
    private static final Pattern FRENCH_IN_COMMENTS = Pattern.compile(
            "(?i)\\b(" + STOPWORDS
            + "|qu|chaque|chacun|toujours|jamais|rien|faut|meme|même|etre|être"
            + "|alors|entre|deja|déjà|lorsque|puisque|afin|dont|quoi|reste"
            + "|elle|lui|ils|cela|ceci|selon|depuis|apres|après)\\b");

    /** Below this, a French word is a quotation or a name. Above it, a document. */
    private static final int THRESHOLD = 6;

    /**
     * The same measure over a comment, where two is already a sentence.
     *
     * <p>A comment is a paragraph of prose inside a page of code, so the count
     * that decides a whole Markdown file cannot decide one. Six French words
     * would let every doc comment in a file be French as long as the file was
     * mostly code - which is exactly the state this test was widened to end.
     *
     * <p>Two is safe to demand because quoted text does not count. Naming the
     * copy a screen shows is the house convention and it is unavoidable here:
     * half the comments in {@code frontend/} explain a design decision by
     * citing the French sentence it produced. Put that sentence in quotes, as
     * they all already do, and it is invisible to this measure. Write French
     * of your own and two words give you away.
     *
     * <p>One word still is not enough, so a three-word comment can slip
     * through. That is the same trade the file-scale threshold makes, taken
     * knowingly: at one word an address in an English sentence, a route slug
     * or a trade name would fail the build.
     */
    private static final int COMMENT_THRESHOLD = 2;

    /**
     * Quoted spans, dropped before counting a comment.
     *
     * <p>An apostrophe is not a quote: {@code the hub's own} used to open a
     * span that ran into the next real quotation and left half of it exposed,
     * so a single quote only delimits when no letter touches it.
     */
    private static final Pattern QUOTED = Pattern.compile(
            "\"[^\"]*\"|(?<![\\p{L}])'[^']*'(?![\\p{L}])|`[^`]*`"
            + "|«[^»]*»|“[^”]*”");

    /** What opens a whole-line comment, per language. */
    private static final Pattern SLASH_COMMENT = Pattern.compile("^\\s*(//+|\\{?/\\*+|\\*+/?)");
    private static final Pattern DASH_COMMENT = Pattern.compile("^\\s*--+");
    private static final Pattern HASH_COMMENT = Pattern.compile("^\\s*#+");

    @Test
    @DisplayName("No prose in this repository is French, unless it is waived as debt")
    void everyDocumentIsEnglish() {
        Map<String, Integer> french = new TreeMap<>();
        Map<String, String> waived = waivers();

        for (Path file : corpus()) {
            String relative = ROOT.relativize(file).toString();
            int hits = frenchScore(file);
            if (hits >= limitFor(file) && !waived.containsKey(relative)) {
                french.put(relative, hits);
            }
        }

        assertThat(french)
                .as("everything a developer reads here is English - code-language has "
                    + "said so since the pack was written. Translate it, or add it to "
                    + "%s with a reason and a date it will be paid. In a comment, the "
                    + "French copy a screen shows does not count as long as it is "
                    + "quoted", WAIVERS)
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
        Map<String, Integer> limits = new LinkedHashMap<>();
        for (Path file : corpus()) {
            String relative = ROOT.relativize(file).toString();
            stillFrench.put(relative, frenchScore(file));
            limits.put(relative, limitFor(file));
        }

        // The translation pass is finished when this file is empty, and every
        // line removed from it is a line that can never come back unnoticed.
        assertThat(waivers().keySet())
                .as("these files are English now, or gone; the waiver is what makes "
                    + "the debt visible and a stale one hides that it was paid")
                .allSatisfy(waived ->
                        assertThat(stillFrench.getOrDefault(waived, 0))
                                .as("%s", waived)
                                .isGreaterThanOrEqualTo(limits.getOrDefault(waived, THRESHOLD)));
    }

    /** Markdown is scored whole; a source file is scored on its comments alone. */
    private static int frenchScore(Path file) {
        String text = read(file);
        if (isMarkdown(file)) {
            return countFrench(text);
        }
        int worst = 0;
        for (String block : commentBlocks(file, text)) {
            worst = Math.max(worst,
                    count(FRENCH_IN_COMMENTS, QUOTED.matcher(block).replaceAll(" ")));
        }
        return worst;
    }

    private static int limitFor(Path file) {
        return isMarkdown(file) ? THRESHOLD : COMMENT_THRESHOLD;
    }

    private static int countFrench(String text) {
        return count(FRENCH, text);
    }

    private static int count(Pattern french, String text) {
        Matcher matcher = french.matcher(text);
        var distinct = new TreeSet<String>();
        while (matcher.find()) {
            distinct.add(matcher.group().toLowerCase(Locale.ROOT));
        }
        return distinct.size();
    }

    /**
     * Consecutive comment lines, joined into the paragraph they were written as.
     *
     * <p>Joined rather than scored one by one because a quotation wraps: the
     * opening mark ends one line and the closing mark opens the next, and a
     * line-at-a-time reading sees an unquoted French fragment where a reader
     * sees a citation.
     *
     * <p>Only lines that are wholly a comment are read. This is a measure, not
     * a parser: reading the tail of a line would mean deciding whether a
     * {@code //} sits inside a string literal, and prose does not live at the
     * end of a line of code anyway.
     *
     * <p>For the same reason it does not read {@code <!-- -->}. That form
     * appears here only inside the sprite's vendored markup string, where the
     * continuation lines carry no marker at all, so a per-line reading would
     * see the banner and miss the paragraph under it. Nothing is claimed there
     * that is not measured.
     */
    private static List<String> commentBlocks(Path file, String text) {
        Pattern marker = markerFor(file);
        List<String> blocks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String line : text.split("\n", -1)) {
            Matcher opener = marker.matcher(line);
            if (opener.find()) {
                current.append(line.substring(opener.end()).strip()).append(' ');
            } else if (current.length() > 0) {
                blocks.add(current.toString());
                current.setLength(0);
            }
        }
        if (current.length() > 0) {
            blocks.add(current.toString());
        }
        return blocks;
    }

    private static Pattern markerFor(Path file) {
        String name = file.getFileName().toString();
        if (name.endsWith(".sql")) {
            return DASH_COMMENT;
        }
        return name.endsWith(".sh") || file.getParent().endsWith(".githooks")
                ? HASH_COMMENT
                : SLASH_COMMENT;
    }

    private static boolean isMarkdown(Path file) {
        return file.getFileName().toString().endsWith(".md");
    }

    /**
     * The design system, and the sign-in theme's verbatim copy of its tokens.
     *
     * <p>Both are French and both stay French. {@code globals.css} was ported
     * from the owner's mockup and is not ours to edit, and a frontend test
     * compares its token block against the theme's copy character for
     * character. Translating either would break that comparison to fix nothing
     * a developer reads for meaning. Every other stylesheet is read normally.
     */
    private static final List<Path> PORTED = List.of(
            Path.of("frontend", "src", "app", "globals.css"),
            Path.of("infrastructure", "keycloak", "themes", "balaaca", "login",
                    "resources", "css", "balaaca.css"));

    /**
     * Everything tracked here that carries prose a developer reads.
     *
     * <p>Generated trees and dependencies are nobody's prose, and the two
     * ported stylesheets above are nobody's to translate.
     */
    private static List<Path> corpus() {
        try (Stream<Path> files = Files.walk(ROOT)) {
            return files.filter(RepositoryLanguageTest::isScored)
                    .filter(p -> {
                        String s = p.toString();
                        return !s.contains("/target/") && !s.contains("/node_modules/")
                               && !s.contains("/.git/") && !s.contains("/.next/")
                               && !s.contains("/generated/");
                    })
                    .filter(p -> PORTED.stream().noneMatch(p::endsWith))
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static boolean isScored(Path path) {
        if (!Files.isRegularFile(path)) {
            return false;
        }
        String name = path.getFileName().toString();
        return name.endsWith(".md")
               || name.endsWith(".java")
               || name.endsWith(".ts")
               || name.endsWith(".tsx")
               || name.endsWith(".mts")
               || name.endsWith(".sql")
               || name.endsWith(".css")
               || name.endsWith(".sh")
               || path.getParent().endsWith(".githooks");
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
