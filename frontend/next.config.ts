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
};

export default nextConfig;
