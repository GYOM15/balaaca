package com.balaaca.app.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A container's healthcheck must poll the port its application actually serves.
 *
 * <p>Both deployables enable Quarkus's management interface, which MOVES the
 * non-application endpoints onto a second port - and both then move health back
 * deliberately, with {@code quarkus.smallrye-health.management.enabled=false},
 * so that a healthcheck has something to read on the port it already knows.
 * That decision is written down in application.properties, in a comment that
 * names container healthchecks specifically.
 *
 * <p>The Dockerfiles polled the management port anyway. Every poll answered 404,
 * so both containers were born unhealthy and stayed unhealthy for as long as
 * they ran. Nothing said so: the process was fine, the API answered requests,
 * and only Docker's own status column disagreed.
 *
 * <p>What that would have cost is in docker-compose.prod.yml, where {@code web}
 * waits on {@code api: condition: service_healthy}. The front end would have
 * waited on a Raspberry Pi for a condition that could not arrive, with nothing
 * in any log to say why - and the person waiting would have been looking at the
 * front end, which was not the broken thing.
 *
 * <p>CI builds none of these images, so nothing caught it. This is the cheap
 * half of that gap: it needs no Docker and no network, and it compares the two
 * files that have to agree. The expensive half - actually booting the images -
 * is worth adding too, and does not make this redundant: this one names the
 * mistake, where a failed boot only says the container never became ready.
 */
class ContainerHealthProbeTest {

    /** The repository root, from app/. */
    private static final Path ROOT = Path.of("..", "..");

    /** The port a HEALTHCHECK line polls, whatever else is on it. */
    private static final Pattern PROBED =
            Pattern.compile("HEALTHCHECK[^\\n]*\\n[^\\n]*127\\.0\\.0\\.1:(\\d+)/q/health/ready");

    @Test
    @DisplayName("the API image polls the port the API serves")
    void apiProbesItsApplicationPort() {
        assertProbeMatchesApplication(
                ROOT.resolve("docker/api.Dockerfile"),
                ROOT.resolve("backend/app/src/main/resources/application.properties"),
                "BACKEND_PORT");
    }

    @Test
    @DisplayName("the worker image polls the port the worker serves")
    void workerProbesItsApplicationPort() {
        assertProbeMatchesApplication(
                ROOT.resolve("docker/worker.Dockerfile"),
                ROOT.resolve("notification-worker/src/main/resources/application.properties"),
                "NOTIFICATION_WORKER_PORT");
    }

    private static void assertProbeMatchesApplication(Path dockerfile,
                                                      Path properties,
                                                      String portVariable) {
        String recipe = read(dockerfile);
        String config = read(properties);

        Matcher probe = PROBED.matcher(recipe);
        assertThat(probe.find())
                .as("%s has no healthcheck reading /q/health/ready over loopback. "
                    + "A container with no probe is a container compose cannot wait "
                    + "for, and docker-compose.prod.yml waits for this one.",
                    dockerfile)
                .isTrue();

        String served = value(config, "quarkus\\.http\\.port", portVariable);
        assertThat(probe.group(1))
                .as("""
                    %s polls port %s and %s serves %s. Health is NOT on the \
                    management interface - the application pins it back on \
                    purpose - so a probe aimed there answers 404 forever and the \
                    container never reports healthy.""",
                    dockerfile, probe.group(1), properties, served)
                .isEqualTo(served);
    }

    /**
     * Health has to STAY on the application port for the two tests above to mean
     * anything. Flipping this property moves it without touching a Dockerfile,
     * and the probes would go quietly wrong again - so the flip has to fail here
     * rather than in a container nobody is watching.
     */
    @Test
    @DisplayName("health is not moved onto the management interface")
    void healthStaysOnTheApplicationPort() {
        for (Path properties : new Path[] {
                ROOT.resolve("backend/app/src/main/resources/application.properties"),
                ROOT.resolve("notification-worker/src/main/resources/application.properties")}) {
            assertThat(read(properties))
                    .as("""
                        %s must keep quarkus.smallrye-health.management.enabled=false. \
                        With it true, /q/health/ready answers only on the management \
                        port, and both container healthchecks - which poll the \
                        application port - would answer 404 on every poll.""",
                        properties)
                    .contains("quarkus.smallrye-health.management.enabled=false");
        }
    }

    /**
     * @param variable the environment variable the property defaults through, so
     *                 that a deployment moving the port moves the probe with it
     */
    private static String value(String config, String property, String variable) {
        Matcher found = Pattern.compile(property + "=\\$\\{" + variable + ":(\\d+)\\}")
                               .matcher(config);
        assertThat(found.find())
                .as("%s is not declared as ${%s:<port>}", property, variable)
                .isTrue();
        return found.group(1);
    }

    private static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("could not read " + file, e);
        }
    }
}
