import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root; a stray lockfile in a parent directory otherwise confuses Turbopack.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
