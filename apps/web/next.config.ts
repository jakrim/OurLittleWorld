import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  trailingSlash: true,
};

export default nextConfig;
