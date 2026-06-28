import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app. A stray package-lock.json exists in the
  // home directory, which made Next infer the wrong root. __dirname keeps it here.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
