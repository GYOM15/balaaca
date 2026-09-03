# The front end - which is also the BFF - as an image.
#
# Built from the repository root:
#   docker build -f docker/web.Dockerfile -t ghcr.io/gyom15/balaaca-web .
#
# This container holds the session key and the OIDC client secret, and it is the
# only thing that ever sees an access token. The browser gets one opaque cookie.
# So the secrets arrive as environment at RUN time and are never build
# arguments: a build argument ends up in the image's own history, readable by
# anyone who can pull it, and these images are public.

# --- Build -------------------------------------------------------------------
FROM node:22-alpine AS build

# The repository's own layout, mirrored, and that is load bearing. `prebuild`
# runs openapi-typescript over ../backend/app/src/main/resources/META-INF/
# openapi.yaml - the contract is written once and the front end's types are
# GENERATED from it, so a build that cannot see that file cannot build at all.
# Flattening frontend/ to the workdir made the relative path resolve to /backend
# and the build died there, which is the correct failure: the types would
# otherwise be whatever was last committed rather than what the API publishes.
WORKDIR /src/frontend

# The lockfile first, then `npm ci` and not `npm install`: ci installs exactly
# what the lockfile pins and fails if the two disagree, which is the difference
# between a reproducible image and one that resolved a new minor at 3am.
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# The contract, at the path the generator expects. On its own line so that a
# change to it invalidates this layer and the build below - which is the point:
# a new endpoint must reach the front end's types.
COPY backend/app/src/main/resources/META-INF/openapi.yaml \
     /src/backend/app/src/main/resources/META-INF/openapi.yaml

COPY frontend/ ./

# Telemetry off. This builds on a domestic connection and reports to nobody.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Run ---------------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Not root, and node's own unprivileged user rather than a new one: the image
# already ships it.
USER node

# The three pieces standalone output is split into, and all three are needed.
# server.js and its traced dependencies come first; .next/static and public/ are
# NOT traced, because nothing imports them - they are fetched by the browser,
# and an image missing them serves a page with no stylesheet and no font.
# server.js sits at the root of standalone/ and not under a frontend/ segment:
# next.config sets outputFileTracingRoot to this directory, so the traced tree
# is already rooted here.
COPY --from=build --chown=node:node /src/frontend/.next/standalone/ ./
COPY --from=build --chown=node:node /src/frontend/.next/static ./.next/static
COPY --from=build --chown=node:node /src/frontend/public ./public

EXPOSE 3000
# 0.0.0.0 and not the default localhost: bound to the loopback INSIDE a
# container, the server is unreachable from the network the rest of the stack
# is on, and the symptom is a proxy timing out against a process that is
# perfectly healthy.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# wget, because busybox ships it and the alpine image has no curl. The root
# page is a server component that reads nothing privileged, so it is a real
# readiness signal rather than a static file that would answer while the server
# behind it was still broken.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
