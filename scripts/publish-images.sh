#!/usr/bin/env bash
# Builds the three images and pushes them, from the machine that can.
#
#   scripts/publish-images.sh                    # for a Raspberry Pi
#   scripts/publish-images.sh --platform linux/amd64   # for a VPS
#   scripts/publish-images.sh --dry-run          # say what would happen
#
# The other half of scripts/deploy.sh. That one runs on the Pi and PULLS; this
# one runs where the images can be built natively and PUSHES. CI builds them
# too, on amd64, and throws them away: what it checks is that the recipes still
# build, and cross-building arm64 there means QEMU and a Maven reactor under
# emulation.
#
# It exists because this side had no script while the other did, so the
# commands lived in a document and got copied by hand. That is how the tag
# expression came to be written in two places, and how three builds were
# started twice on a disk that could not hold them.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib/image-tag.sh
. scripts/lib/image-tag.sh

PLATFORM=linux/arm64
DRY_RUN=false
# Reported, not enforced. An earlier version refused to start below ten
# gigabytes, and that was wrong twice over: the number was invented and
# presented as a measurement, and a build with a warm layer cache needs a small
# fraction of a build from cold, so the guard would refuse runs that would have
# finished comfortably.
#
# What is worth having is not a gate, it is the right explanation afterwards. A
# disk that fills does not fail the build: it kills the daemon, and the message
# that surfaces then is "cannot connect to the Docker daemon", which sends
# somebody to restart Docker rather than to free space. Step 5 says so when it
# actually happens.
#
# --min-free exists for anybody who wants a gate, and is off by default.
MIN_FREE_GB=0

while [ $# -gt 0 ]; do
    case "$1" in
        --platform) PLATFORM="$2"; shift 2 ;;
        --min-free) MIN_FREE_GB="$2"; shift 2 ;;
        --dry-run)  DRY_RUN=true; shift ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. Is this checkout one whose images anybody will ask for ---------------
# Deploying pulls the tag computed from the Pi's checkout of main. Building from
# a feature branch publishes a tag that checkout will never compute, and the
# deployment then fails on a pull with a message that blames the registry.
say "1/5  The checkout"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != main ]; then
    fail "On branch $BRANCH. Images are published from main, which is what the Pi
deploys. Switch first:

    git checkout main && git pull --ff-only"
fi

git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    fail "main here is not origin/main. Publishing from a stale or ahead
checkout tags images with a commit the Pi will not compute.

    git pull --ff-only"
fi

if [ -n "$(git status --porcelain -- backend frontend docker)" ]; then
    fail "backend/, frontend/ or docker/ has uncommitted changes. They would go
into the image under a tag that says they did not."
fi
echo "     main, clean, level with origin"

# --- 2. Which tag, and it is not typed --------------------------------------
say "2/5  The tag"
TAG=$(image_tag)
echo "     $TAG"
echo "     deploy.sh on the Pi computes this same expression; if the two"
echo "     disagree, the pull there fails."

# --- 3. Can this machine finish ----------------------------------------------
# Checked BEFORE the first build rather than discovered during the third. A
# disk that fills mid-build takes the daemon down with it, and the error that
# surfaces afterwards is "Cannot connect to the Docker daemon", which sends
# somebody to restart Docker rather than to free space.
say "3/5  This machine"
if ! command -v docker >/dev/null 2>&1; then
    fail "docker is not on this machine's PATH."
fi
if ! docker info >/dev/null 2>&1; then
    fail "The Docker daemon is not answering. If it filled its disk it is
already dead; free space first, then restart Docker Desktop."
fi

FREE_GB=$(df -g . | awk 'NR==2 {print $4}')
RECLAIM=$(docker system df --format '{{.Reclaimable}}' 2>/dev/null | head -1)
echo "     $FREE_GB GB free${RECLAIM:+, $RECLAIM reclaimable in Docker}"
if [ "$FREE_GB" -lt 3 ]; then
    echo "     that is tight. If a build dies, this is why:"
    echo "         docker image prune -f && docker builder prune -f"
    echo "     Never --volumes: that deletes the development database."
fi
if [ "$MIN_FREE_GB" -gt 0 ] && [ "$FREE_GB" -lt "$MIN_FREE_GB" ]; then
    fail "Below the --min-free $MIN_FREE_GB GB you asked for."
fi

# A pull of a private package needs read:packages; a push needs write:packages.
# Checked by asking the registry rather than by reading config.json, because a
# stale entry there is indistinguishable from a live one.
if ! docker manifest inspect "$BALAACA_REGISTRY/balaaca-api:latest" >/dev/null 2>&1; then
    echo "     note: cannot read $BALAACA_REGISTRY/balaaca-api:latest."
    echo "     If the push fails on permissions: docker login ghcr.io"
fi

# --- 4. Build ----------------------------------------------------------------
say "4/5  Building for $PLATFORM"
for image in $BALAACA_IMAGES; do
    echo "     $image"
    if [ "$DRY_RUN" = true ]; then
        echo "       would: docker build --platform $PLATFORM -f docker/$image.Dockerfile ..."
        continue
    fi
    if ! docker build --platform "$PLATFORM" \
            -f "docker/$image.Dockerfile" \
            -t "$BALAACA_REGISTRY/balaaca-$image:$TAG" \
            -t "$BALAACA_REGISTRY/balaaca-$image:latest" \
            .; then
        # The one diagnosis Docker's own message gets wrong. A daemon that
        # stopped answering DURING a build almost always means the disk filled,
        # and "cannot connect to the Docker daemon" reads like Docker was never
        # running - so the operator restarts it, watches it die again, and does
        # not think about space.
        if ! docker info >/dev/null 2>&1; then
            fail "The $image build stopped and the Docker daemon is no longer
answering. It filled its disk: $(df -h . | awk 'NR==2 {print $4}') free now.
Restarting Docker will not help until there is room.

    docker image prune -f && docker builder prune -f

Never --volumes: that deletes the development database. Nothing was pushed."
        fi
        fail "The $image image did not build. Nothing has been pushed."
    fi
done

# --- 5. Push -----------------------------------------------------------------
# After every build, not between them. A half-published set is a deployment
# that pulls two new images and one old one, which starts and is wrong.
say "5/5  Pushing"
for image in $BALAACA_IMAGES; do
    if [ "$DRY_RUN" = true ]; then
        echo "     would push $BALAACA_REGISTRY/balaaca-$image:$TAG and :latest"
        continue
    fi
    docker push "$BALAACA_REGISTRY/balaaca-$image:$TAG"
    docker push "$BALAACA_REGISTRY/balaaca-$image:latest"
done

say "Published: $TAG"
cat <<NEXT
     On the Pi:

         cd ~/balaaca && git pull --ff-only
         git log -1 --format=%h -- backend frontend docker    # must print $TAG
         scripts/deploy.sh

     If that middle line prints anything else, the Pi is not on the commit
     these images were built from and deploy.sh will pull a tag that does not
     exist.
NEXT
