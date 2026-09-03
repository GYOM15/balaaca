# The business API, as an image.
#
# Built from the repository root:
#   docker build -f docker/api.Dockerfile -t ghcr.io/gyom15/balaaca-api .
#
# Two stages, and the split is the point: the builder carries Maven, a JDK and
# a few hundred megabytes of downloaded dependencies, none of which a running
# server needs. What ships is a JRE and the fast-jar.
#
# Tests are NOT run here, and that is a decision rather than an omission. CI is
# the authority - it runs the unit suites, the integration suites against a real
# PostgreSQL, ArchUnit, the mutation gate and the contract checks. Running them
# again inside every image build would add minutes to each one to prove what a
# green pipeline already proved, and it would fail on a machine with no Docker
# socket for Testcontainers. An image is built from a commit CI has passed.

# --- Build -------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src

# The poms first, and only the poms. Dependency resolution then lands in a layer
# that a source edit does not invalidate, so changing one Java file re-downloads
# nothing. This matters most on the slowest connection, which is the one this
# product is built for.
COPY backend/pom.xml backend/
COPY backend/shared-kernel/pom.xml backend/shared-kernel/
COPY backend/platform-kernel/pom.xml backend/platform-kernel/
COPY backend/identity/pom.xml backend/identity/
COPY backend/providers/pom.xml backend/providers/
COPY backend/catalog/pom.xml backend/catalog/
COPY backend/scheduling/pom.xml backend/scheduling/
COPY backend/booking/pom.xml backend/booking/
COPY backend/billing/pom.xml backend/billing/
COPY backend/app/pom.xml backend/app/

# A cache mount, not a layer: the downloaded repository speeds up the NEXT build
# on this machine and is not baked into the image, where it would be dead weight
# that ships to the Pi.
RUN --mount=type=cache,target=/root/.m2/repository \
    mvn -B -f backend/pom.xml -pl app -am dependency:go-offline -DskipTests

COPY backend/ backend/

RUN --mount=type=cache,target=/root/.m2/repository \
    mvn -B -f backend/pom.xml -pl app -am package \
        -DskipTests -Djacoco.skip=true -Dspotless.check.skip=true

# --- Run ---------------------------------------------------------------------
FROM eclipse-temurin:21-jre

# curl for the healthcheck, and nothing else. The Keycloak image has none, which
# is why the compose file probes it by opening a socket from bash; here the
# probe can simply read /q/health/ready and say what it found.
RUN apt-get update \
 && apt-get install --no-install-recommends -y curl \
 && rm -rf /var/lib/apt/lists/*

# Not root. A process that only reads a jar and writes to one directory has no
# use for it, and the media root below is the one thing it must own.
RUN useradd --system --uid 10001 --create-home balaaca

# Uploaded images live here, on a volume. Created and owned before the user
# drops in: a container that starts as balaaca cannot chown a mount point.
ENV BALAACA_MEDIA_ROOT=/var/lib/balaaca/media
RUN mkdir -p "$BALAACA_MEDIA_ROOT" && chown -R balaaca:balaaca /var/lib/balaaca

WORKDIR /app
# The fast-jar layout, copied in its own dependency order: lib/ changes when a
# dependency does, app/ changes on every commit. Copying the directory whole
# would put both in one layer and push forty megabytes for a one-line fix.
COPY --from=build --chown=balaaca:balaaca /src/backend/app/target/quarkus-app/lib/ ./lib/
COPY --from=build --chown=balaaca:balaaca /src/backend/app/target/quarkus-app/*.jar ./
COPY --from=build --chown=balaaca:balaaca /src/backend/app/target/quarkus-app/app/ ./app/
COPY --from=build --chown=balaaca:balaaca /src/backend/app/target/quarkus-app/quarkus/ ./quarkus/

USER balaaca

# 8080 carries the API and its health endpoints; 9000 is the management port and
# carries /q/metrics. Splitting them is deliberate - a metrics endpoint has no
# business being reachable on the port a customer's browser talks to - and 9000
# is published nowhere, so Prometheus reaches it over the network by name.
EXPOSE 8080 9000

# Headless, explicitly. The image pipeline drives javax.imageio, and a JVM that
# thinks it has a display looks for an X server that is not there. Ubuntu's JRE
# usually infers it; "usually" is not a thing to deploy on.
#
# MaxRAMPercentage rather than a fixed -Xmx: this runs on a Raspberry Pi today
# and a VPS later, and a heap sized for one is wrong on the other. The container
# limit is the truth, and the JVM reads it.
ENV JAVA_OPTS="-Djava.awt.headless=true -XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"

# Health is on the APPLICATION port, not the management one. 9000 serves
# /q/metrics and answers 404 to this path - measured, not assumed. A probe
# pointed there reports a perfectly healthy container as unhealthy forever,
# and compose then waits on a condition that can never become true.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/q/health/ready || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/quarkus-run.jar"]
