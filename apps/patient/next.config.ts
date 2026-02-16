import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.BASE_PATH || "",
  transpilePackages: ["@second-opinion/shared"],
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
