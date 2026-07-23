import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root (multiple lockfiles exist above this dir).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
