# shellcheck shell=bash
#
# Sourced, never executed, so there is no shebang and the directive above is
# what tells shellcheck which shell to judge this as.
#
# The one definition of which images a checkout wants.
#
# Sourced by scripts/publish-images.sh, which builds and pushes them, and by
# scripts/deploy.sh, which pulls them. Those two run on different machines,
# days apart, and they have to arrive at the same string from the same checkout
# or the deployment pulls a tag nobody published - and deploy.sh's own failure
# message does not name that as a possibility, so the operator goes and checks
# two other things first.
#
# It was written twice before this file existed: once in deploy.sh and once in
# a set of commands copied out of a conversation. Two places, one rule, nothing
# comparing them.
#
# The LAST COMMIT THAT COULD HAVE CHANGED AN IMAGE, which is not the last
# commit. Most of them touch a compose file, a script or a document, and
# rebuilding three images for those is work for nothing. The three paths are
# what goes into an image: backend/ and frontend/ are the sources, docker/ holds
# the recipes.
#
# Usage: image_tag  -> prints the short sha, or fails loudly if there is none.
image_tag() {
    local tag
    tag=$(git log -1 --format=%h -- backend frontend docker)
    if [ -z "$tag" ]; then
        echo "no commit in this checkout touches backend/, frontend/ or docker/." >&2
        echo "That should be impossible in a real clone; is this a shallow one?" >&2
        return 1
    fi
    printf '%s\n' "$tag"
}

# The three images, named as the production compose file names them. Kept here
# beside the tag because a fourth copy of "ghcr.io/gyom15/balaaca-" is exactly
# the kind of string that gets renamed in one place.
#
# Read by publish-images.sh and not by deploy.sh, which takes its image names
# from the compose file instead. shellcheck reads this file on its own and can
# see neither, so it calls them unused. They are deliberately NOT exported: they
# are for the script that sources this one, not for its children.
# shellcheck disable=SC2034
BALAACA_REGISTRY="ghcr.io/gyom15"
# shellcheck disable=SC2034
BALAACA_IMAGES="api worker web"
