# The notification worker, as an image.
#
# Built from the repository root:
#   docker build -f docker/worker.Dockerfile -t ghcr.io/gyom15/balaaca-worker .
#
# A SEPARATE reactor, and therefore a separate image, which is the whole point
# of the split: it drains the outbox under its own least-privilege database
# role, it holds no tenant, and it can be restarted, scaled or stopped without
# touching the API. `mvn verify` under backend/ proves nothing about this - it
# is not one of that reactor's modules.
#
# It does need backend/pom.xml, and only that: it declares balaaca-backend as
# its parent through a relative path, and inherits versions and plugin
# management from it. It depends on none of the backend's modules.

# --- Build -------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src

# The parent pom and this reactor's own, before the sources: the dependency
# layer then survives a change to a Java file.
COPY backend/pom.xml backend/pom.xml
COPY notification-worker/pom.xml notification-worker/pom.xml

RUN --mount=type=cache,target=/root/.m2/repository \
    mvn -B -f notification-worker/pom.xml dependency:go-offline -DskipTests

COPY notification-worker/ notification-worker/

RUN --mount=type=cache,target=/root/.m2/repository \
    mvn -B -f notification-worker/pom.xml package \
        -DskipTests -Djacoco.skip=true -Dspotless.check.skip=true

# --- Run ---------------------------------------------------------------------
FROM eclipse-temurin:21-jre

RUN apt-get update \
 && apt-get install --no-install-recommends -y curl \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --system --uid 10002 --create-home balaaca

WORKDIR /app
COPY --from=build --chown=balaaca:balaaca /src/notification-worker/target/quarkus-app/lib/ ./lib/
COPY --from=build --chown=balaaca:balaaca /src/notification-worker/target/quarkus-app/*.jar ./
COPY --from=build --chown=balaaca:balaaca /src/notification-worker/target/quarkus-app/app/ ./app/
COPY --from=build --chown=balaaca:balaaca /src/notification-worker/target/quarkus-app/quarkus/ ./quarkus/

USER balaaca

# 8090 and 9100, not 8080 and 9000: the worker and the API run side by side on
# one machine and a shared port is a race one of them loses at boot.
EXPOSE 8090 9100

# No AWT here - this one sends messages, it does not decode images - but the
# heap sizing matters more, not less: it runs beside the API on the same Pi.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=50 -XX:+ExitOnOutOfMemoryError"

# Health is on the APPLICATION port, not the management one. 9100 serves
# /q/metrics and answers 404 to this path - measured, not assumed. A probe
# pointed there reports a perfectly healthy container as unhealthy forever,
# and compose then waits on a condition that can never become true.
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8090/q/health/ready || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/quarkus-run.jar"]
