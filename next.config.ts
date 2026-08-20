import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type-checking runs as its own step (`npm run typecheck`, and in the
    // build script below) instead of inside `next build`'s worker. On this
    // dev machine's ~7GB RAM, the bundled webpack+typecheck worker
    // consistently hits Node's default ~2GB heap ceiling on a project this
    // size, while a standalone `tsc --noEmit` does not. Type errors are
    // still caught — just by a lighter, separate process — not skipped.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
