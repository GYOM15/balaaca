import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/**
 * Nothing is statically exported and nothing is cached by default.
 *
 * Every page here reads either a customer's live availability or a provider's
 * own diary, and both are wrong the moment they are a minute old. Next caches
 * aggressively unless told otherwise, and a cached agenda is somebody else's
 * agenda the moment two providers share a node.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No generated AGENTS.md / CLAUDE.md. This repository states its own
  // conventions, in .claude/, and a second file appearing under frontend/
  // saying something else is a contradiction nobody would notice writing.
  agentRules: false,
  // The BFF talks to the backend over the container network, so no rewrite and
  // no CORS: the browser never addresses the API at all.
  poweredByHeader: false,

  // This directory, explicitly. The repository root carries its own
  // package-lock.json - it pins the one Node tool the pipeline runs - and Next
  // infers a workspace root from whichever lockfile it finds first, then warns
  // that it found two. Saying which one is meant costs nothing and stops the
  // build from guessing.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),

  experimental: {
    serverActions: {
      /**
       * Six megabytes, and the number is not arbitrary: it must sit ABOVE what
       * the API accepts, which is five.
       *
       * Next buffers a server action's whole body and refuses anything over
       * this limit with a runtime error of its own - a red overlay naming a
       * configuration key, before a single line of our code runs. So a limit
       * equal to or below the API's would mean the API's own refusal, which is
       * a sentence a provider can act on, could never be reached: every photo
       * between the two numbers would die as a stack trace instead.
       *
       * The default is one megabyte, and a photograph from any telephone made
       * in the last decade is two to five. Uploading a logo was therefore
       * impossible, not merely awkward.
       *
       * If SanitisedImage.MAX_BYTES moves, this moves with it.
       */
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
