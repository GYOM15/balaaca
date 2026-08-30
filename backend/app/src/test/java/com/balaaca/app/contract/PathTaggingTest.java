package com.balaaca.app.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Every operation on one path must carry one tag.
 *
 * <p>This is not tidiness. The generator emits one interface per tag, each
 * resource class implements one interface, and JAX-RS resolves a path to exactly
 * ONE resource class - so a path split across two tags becomes two classes, of
 * which the router keeps one and answers <b>405</b> to every method on the
 * other.
 *
 * <p>It has already happened once. {@code GET /v1/providers} was added under
 * {@code discovery} while {@code POST /v1/providers} sat under {@code
 * onboarding}, and registration - the operation without which no salon can exist
 * at all - started answering 405. Nothing failed: the directory's own tests
 * passed, registration's tests were not in that run, and the defect was found
 * days later by a test on an unrelated path.
 *
 * <p>Reading the document line by line rather than through a YAML parser keeps
 * this test dependency-free and matches {@code ErrorCatalogueTest}. The shape it
 * relies on - two-space path keys, four-space methods, a {@code tags:} line - is
 * the shape the whole file already has.
 */
class PathTaggingTest {

    private static final Path SPEC =
            Path.of("src/main/resources/META-INF/openapi.yaml");

    private static final Pattern PATH = Pattern.compile("^ {2}(/\\S+):\\s*$");
    private static final Pattern METHOD =
            Pattern.compile("^ {4}(get|put|post|delete|patch):\\s*$");
    private static final Pattern TAGS = Pattern.compile("^ {6}tags: \\[([^\\]]+)\\]\\s*$");

    @Test
    @DisplayName("One path is one tag, because one path is one resource class")
    void everyPathCarriesASingleTag() {
        Map<String, Set<String>> tagsByPath = tagsByPath();

        assertThat(tagsByPath)
                .as("no paths were parsed out of %s", SPEC.toAbsolutePath())
                .isNotEmpty();

        Map<String, Set<String>> split = new TreeMap<>();
        tagsByPath.forEach((path, tags) -> {
            if (tags.size() > 1) {
                split.put(path, tags);
            }
        });

        assertThat(split)
                .as("each of these paths would be generated into two interfaces, "
                    + "served by two resource classes, and answer 405 on whichever "
                    + "one the router did not keep")
                .isEmpty();
    }

    @Test
    @DisplayName("Every operation carries a tag at all")
    void everyOperationIsTagged() {
        // An untagged operation lands in a default interface, which is the same
        // failure wearing a different name.
        assertThat(untaggedOperations())
                .as("an operation with no tag is generated into a default "
                    + "interface, splitting its path just as effectively")
                .isEmpty();
    }

    @Test
    @DisplayName("The check itself catches a split path")
    void detectsASplitPath() {
        // The published document is expected to be clean, so asserting on it
        // proves nothing about whether this test would notice. It is run here
        // against a document that is deliberately wrong - in exactly the shape
        // that shipped a broken registration - so a refactor that quietly
        // stopped detecting anything fails instead of passing.
        List<String> split = List.of(
                "paths:",
                "  /v1/providers:",
                "    get:",
                "      operationId: listProviders",
                "      tags: [providers]",
                "    post:",
                "      operationId: registerProvider",
                "      tags: [onboarding]");

        assertThat(tagsByPath(split)).containsEntry(
                "/v1/providers", new LinkedHashSet<>(List.of("providers", "onboarding")));
    }

    private static Map<String, Set<String>> tagsByPath() {
        return tagsByPath(lines());
    }

    private static Map<String, Set<String>> tagsByPath(List<String> lines) {
        Map<String, Set<String>> found = new LinkedHashMap<>();
        String path = null;
        boolean inOperation = false;

        for (String line : lines) {
            Matcher pathLine = PATH.matcher(line);
            if (pathLine.matches()) {
                path = pathLine.group(1);
                inOperation = false;
                found.putIfAbsent(path, new LinkedHashSet<>());
                continue;
            }
            if (path == null) {
                continue;
            }
            if (METHOD.matcher(line).matches()) {
                inOperation = true;
                continue;
            }
            Matcher tags = TAGS.matcher(line);
            if (inOperation && tags.matches()) {
                for (String tag : tags.group(1).split(",")) {
                    found.get(path).add(tag.trim());
                }
                inOperation = false;
            }
        }
        // components: and everything after it holds no paths.
        found.values().removeIf(Set::isEmpty);
        return found;
    }

    private static List<String> untaggedOperations() {
        List<String> untagged = new java.util.ArrayList<>();
        String path = null;
        String method = null;

        for (String line : lines()) {
            Matcher pathLine = PATH.matcher(line);
            if (pathLine.matches()) {
                path = pathLine.group(1);
                method = null;
                continue;
            }
            Matcher methodLine = METHOD.matcher(line);
            if (methodLine.matches()) {
                if (method != null) {
                    untagged.add(path + " " + method);
                }
                method = methodLine.group(1);
                continue;
            }
            if (method != null && TAGS.matcher(line).matches()) {
                method = null;
            }
        }
        if (method != null) {
            untagged.add(path + " " + method);
        }
        return untagged;
    }

    private static List<String> lines() {
        try {
            return Files.readAllLines(SPEC, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
